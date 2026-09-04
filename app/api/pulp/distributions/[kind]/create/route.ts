import { cookies } from "next/headers";
import {
  getPulpApiUrl,
  PULP_AUTH_COOKIE,
  pulpFetch,
  toBasicAuthHeader,
  type PulpAuth,
} from "@/lib/pulp";
import { findPulpPlugin, type PulpPluginDescriptor } from "@/lib/pulp-plugins";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import {
  authHeaders,
  hrefFromCreatedResource,
  extractNextApiPath,
  normalizePulpHrefToApiPath,
  readDetail,
  TaskRefResponse,
  toPulpHrefPath,
  waitForTask,
} from "@/app/api/pulp/repositories/_server";

type CreateBody = {
  repository?: string;
  name?: string;
  base_path?: string;
};

type PulpDistribution = {
  pulp_href: string;
  base_url: string;
  base_path: string;
  name: string;
  repository: string | null;
};

function isPluginRepositoryPath(plugin: PulpPluginDescriptor, path: string): boolean {
  return path.includes(plugin.repositoryPath);
}

function repoRefKey(href: string): string {
  return normalizePulpHrefToApiPath(href).replace(/\/+$/, "");
}

type DistListPage = {
  next: string | null;
  results: Array<{ pulp_href: string; repository: string | null }>;
};

async function findFirstLinkedDistributionHref(
  plugin: PulpPluginDescriptor,
  repoHref: string,
  auth: PulpAuth
): Promise<
  | { ok: true; pulp_href: string | null }
  | { ok: false; status: number; detail: string }
> {
  const want = repoRefKey(repoHref);
  let listPath: string | null = `${plugin.distributionPath}?limit=200`;

  while (listPath) {
    const pageResult = await pulpFetch<DistListPage>(listPath, auth);
    if (!pageResult.ok) {
      return { ok: false, status: pageResult.status, detail: pageResult.detail };
    }
    const page = pageResult.data;
    for (const row of page.results) {
      if (row.repository && repoRefKey(row.repository) === want) {
        return { ok: true, pulp_href: row.pulp_href };
      }
    }
    listPath = extractNextApiPath(page.next);
  }

  return { ok: true, pulp_href: null };
}

async function finalizeDistributionWrite(
  authHeader: string,
  pulpHref: string | null,
  fallbackName: string,
  fallbackBasePath: string,
  taskHref: string | null
): Promise<Response> {
  let hrefOut = pulpHref;

  try {
    if (taskHref) {
      const task = await waitForTask(taskHref, authHeader);
      hrefOut = hrefFromCreatedResource(task.created_resources?.[0]) ?? hrefOut;
    }
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "Distribution task failed." },
      { status: 500 }
    );
  }

  let baseUrl: string | null = null;
  let distName: string | null = null;
  let basePathOut = fallbackBasePath;

  if (hrefOut) {
    const detailPath = normalizePulpHrefToApiPath(hrefOut);
    const detailRes = await fetch(getPulpApiUrl(detailPath), {
      method: "GET",
      headers: authHeaders(authHeader),
      cache: "no-store",
    });
    if (detailRes.ok) {
      const dist = (await detailRes.json()) as PulpDistribution;
      baseUrl = dist.base_url ?? baseUrl;
      distName = dist.name ?? distName;
      basePathOut = dist.base_path ?? basePathOut;
    }
  }

  return Response.json({
    name: distName ?? fallbackName,
    pulp_href: hrefOut,
    base_url: baseUrl,
    base_path: basePathOut,
    task: taskHref,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { kind } = await params;
  const plugin = findPulpPlugin(kind);
  if (!plugin) {
    return Response.json({ detail: `Unknown distribution kind: ${kind}` }, { status: 400 });
  }

  const body = (await request.json()) as CreateBody;
  const repoHref = body.repository?.trim();
  const name = body.name?.trim();
  const basePath = body.base_path?.trim();

  if (!repoHref) {
    return Response.json({ detail: "repository (pulp_href) is required." }, { status: 400 });
  }
  if (!name) {
    return Response.json({ detail: "Distribution name is required." }, { status: 400 });
  }
  if (!basePath) {
    return Response.json({ detail: "base_path is required." }, { status: 400 });
  }

  const apiPath = normalizePulpHrefToApiPath(repoHref);
  if (!isPluginRepositoryPath(plugin, apiPath)) {
    return Response.json(
      {
        detail: `Only ${plugin.label} repository hrefs can be bound to ${plugin.article} ${plugin.label} distribution.`,
      },
      { status: 400 }
    );
  }

  const authHeader = toBasicAuthHeader(authResult.auth);
  const headers = authHeaders(authHeader);
  headers.set("Content-Type", "application/json");

  const repositoryField = toPulpHrefPath(repoHref);

  const linked = await findFirstLinkedDistributionHref(plugin, repoHref, authResult.auth);
  if (!linked.ok) {
    if (linked.status === 401 || linked.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: linked.detail }, { status: linked.status });
  }

  if (linked.pulp_href) {
    const patchPath = normalizePulpHrefToApiPath(linked.pulp_href);
    const patchResponse = await fetch(getPulpApiUrl(patchPath), {
      method: "PATCH",
      headers,
      body: JSON.stringify({ name, base_path: basePath }),
      cache: "no-store",
    });

    if (!patchResponse.ok) {
      if (patchResponse.status === 401 || patchResponse.status === 403) {
        const cookieStore = await cookies();
        cookieStore.delete(PULP_AUTH_COOKIE);
      }
      return Response.json({ detail: await readDetail(patchResponse) }, { status: patchResponse.status });
    }

    let taskHref: string | null = null;
    const ct = patchResponse.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const rawText = await patchResponse.text();
      if (rawText) {
        try {
          const parsed = JSON.parse(rawText) as TaskRefResponse;
          taskHref = parsed.task ?? null;
        } catch {
          // Non-task JSON body — ignore.
        }
      }
    }

    return finalizeDistributionWrite(authHeader, linked.pulp_href, name, basePath, taskHref);
  }

  const createResponse = await fetch(getPulpApiUrl(plugin.distributionPath), {
    method: "POST",
    headers,
    body: JSON.stringify({
      name,
      base_path: basePath,
      repository: repositoryField,
    }),
    cache: "no-store",
  });

  if (!createResponse.ok) {
    if (createResponse.status === 401 || createResponse.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: await readDetail(createResponse) }, { status: createResponse.status });
  }

  const raw = (await createResponse.json()) as TaskRefResponse & Partial<PulpDistribution>;
  const pulpHref = raw.pulp_href ?? raw.href ?? null;

  return finalizeDistributionWrite(authHeader, pulpHref, name, basePath, raw.task ?? null);
}
