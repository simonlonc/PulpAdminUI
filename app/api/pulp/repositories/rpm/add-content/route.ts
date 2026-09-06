import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch, type PulpAuth } from "@/lib/pulp";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import {
  hrefFromCreatedResource,
  normalizePulpHrefToApiPath,
  TaskRefResponse,
  toPulpHrefPath,
  waitForTask,
} from "../../_server";

type AddToRepositoryBody = {
  repositoryName?: string;
  content?: string;
};

type PulpRepository = {
  pulp_href?: string;
  href?: string;
};

type ListRepositoriesResponse = {
  results?: PulpRepository[];
};

async function findOrCreateRepository(
  repositoryName: string,
  auth: PulpAuth
): Promise<{ ok: true; href: string } | { ok: false; status: number; detail: string }> {
  const listResult = await pulpFetch<ListRepositoriesResponse>(
    `/repositories/rpm/rpm/?name=${encodeURIComponent(repositoryName)}`,
    auth
  );
  if (!listResult.ok) {
    return { ok: false, status: listResult.status, detail: listResult.detail };
  }

  const existing = listResult.data.results?.[0];
  if (existing?.pulp_href || existing?.href) {
    return { ok: true, href: existing.pulp_href ?? existing.href ?? "" };
  }

  const createResult = await pulpFetch<TaskRefResponse>("/repositories/rpm/rpm/", auth, {
    method: "POST",
    body: JSON.stringify({ name: repositoryName }),
  });
  if (!createResult.ok) {
    return { ok: false, status: createResult.status, detail: createResult.detail };
  }

  const created = createResult.data;
  let repoHref = created.pulp_href ?? created.href ?? null;

  if (created.task) {
    try {
      const task = await waitForTask(created.task, auth);
      repoHref = hrefFromCreatedResource(task.created_resources?.[0]) ?? repoHref;
    } catch (error) {
      return {
        ok: false,
        status: 500,
        detail: error instanceof Error ? error.message : "Repository creation task failed.",
      };
    }
  }

  if (!repoHref) {
    return { ok: false, status: 502, detail: "Repository creation completed without repository href." };
  }

  return { ok: true, href: repoHref };
}

export async function POST(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const body = (await request.json()) as AddToRepositoryBody;
  const repositoryName = body.repositoryName?.trim();
  const content = body.content?.trim();
  if (!repositoryName) {
    return Response.json({ detail: "Repository name is required." }, { status: 400 });
  }
  if (!content) {
    return Response.json({ detail: "Content href is required." }, { status: 400 });
  }

  const repoResult = await findOrCreateRepository(repositoryName, authResult.auth);
  if (!repoResult.ok) {
    if (repoResult.status === 401 || repoResult.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: repoResult.detail }, { status: repoResult.status });
  }

  const repositoryHref = repoResult.href;

  const modifyResult = await pulpFetch<TaskRefResponse>(
    `${normalizePulpHrefToApiPath(repositoryHref)}modify/`,
    authResult.auth,
    {
      method: "POST",
      body: JSON.stringify({
        add_content_units: [toPulpHrefPath(content)],
      }),
    }
  );

  if (!modifyResult.ok) {
    if (modifyResult.status === 401 || modifyResult.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: modifyResult.detail }, { status: modifyResult.status });
  }

  const modifyPayload = modifyResult.data;
  if (modifyPayload.task) {
    try {
      await waitForTask(modifyPayload.task, authResult.auth);
    } catch (error) {
      return Response.json(
        { detail: error instanceof Error ? error.message : "Failed to add content to repository." },
        { status: 500 }
      );
    }
  }

  return Response.json({
    repository: repositoryHref,
    content: toPulpHrefPath(content),
    task: modifyPayload.task ?? null,
  });
}
