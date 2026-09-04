import { cookies } from "next/headers";
import { getPulpApiUrl, PULP_AUTH_COOKIE, pulpFetch, toBasicAuthHeader } from "@/lib/pulp";
import { findPulpPlugin } from "@/lib/pulp-plugins";
import { requirePulpAuth } from "../_helpers";
import {
  authHeaders,
  hrefFromCreatedResource,
  buildUpstreamListParams,
  normalizePulpHrefToApiPath,
  readDetail,
  toPulpHrefPath,
  TaskRefResponse,
  waitForTask,
} from "../repositories/_server";

type PulpDistribution = {
  pulp_href: string;
  pulp_created: string;
  base_path: string;
  base_url: string;
  content_guard: string | null;
  pulp_labels: Record<string, string>;
  name: string;
  repository: string | null;
};

type PulpListResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export async function GET(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const url = new URL(request.url);
  const qs = buildUpstreamListParams(url.searchParams, ["repository"]);

  const result = await pulpFetch<PulpListResponse<PulpDistribution>>(
    `/distributions/?${qs.toString()}`,
    authResult.auth
  );
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }

    return Response.json({ detail: result.detail }, { status: result.status });
  }

  return Response.json(result.data);
}

type CreateBody = {
  kind?: string;
  name?: string;
  base_path?: string;
  repository?: string | null;
  publication?: string | null;
  content_guard?: string | null;
};

/**
 * Plain distribution create: always POSTs a new distribution for the given plugin kind,
 * bound to a repository, a publication, or neither, with an optional content guard.
 * Unlike [kind]/create/route.ts — the repositories page's "distribute this repository"
 * convenience flow, which finds a distribution already linked to the repository and
 * patches it instead of creating a duplicate — this route always creates.
 */
export async function POST(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ detail: "Invalid request body." }, { status: 400 });
  }

  const plugin = findPulpPlugin(body.kind ?? "");
  if (!plugin) {
    return Response.json({ detail: `Unknown distribution kind: ${body.kind}` }, { status: 400 });
  }

  const name = body.name?.trim();
  const basePath = body.base_path?.trim();
  if (!name) {
    return Response.json({ detail: "Distribution name is required." }, { status: 400 });
  }
  if (!basePath) {
    return Response.json({ detail: "base_path is required." }, { status: 400 });
  }

  const createPayload: Record<string, unknown> = { name, base_path: basePath };
  if (body.repository) {
    createPayload.repository = toPulpHrefPath(body.repository);
  }
  if (body.publication) {
    createPayload.publication = toPulpHrefPath(body.publication);
  }
  if (body.content_guard) {
    createPayload.content_guard = toPulpHrefPath(body.content_guard);
  }

  const authHeader = toBasicAuthHeader(authResult.auth);
  const headers = authHeaders(authHeader);
  headers.set("Content-Type", "application/json");

  const createResponse = await fetch(getPulpApiUrl(plugin.distributionPath), {
    method: "POST",
    headers,
    body: JSON.stringify(createPayload),
    cache: "no-store",
  });

  if (!createResponse.ok) {
    if (createResponse.status === 401 || createResponse.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: await readDetail(createResponse) }, { status: createResponse.status });
  }

  const raw = (await createResponse.json()) as TaskRefResponse;
  let hrefOut = raw.pulp_href ?? raw.href ?? null;

  try {
    if (raw.task) {
      const task = await waitForTask(raw.task, authHeader);
      hrefOut = hrefFromCreatedResource(task.created_resources?.[0]) ?? hrefOut;
    }
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "Distribution task failed." },
      { status: 500 }
    );
  }

  let baseUrl: string | null = null;
  let nameOut = name;
  let basePathOut = basePath;

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
      nameOut = dist.name ?? nameOut;
      basePathOut = dist.base_path ?? basePathOut;
    }
  }

  return Response.json({
    pulp_href: hrefOut,
    name: nameOut,
    base_path: basePathOut,
    base_url: baseUrl,
  });
}
