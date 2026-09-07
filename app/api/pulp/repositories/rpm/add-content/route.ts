import { pulpFetch, type PulpAuth } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import { normalizePulpHrefToApiPath, TaskRefResponse, toPulpHrefPath } from "../../_server";

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
  // Pulp answers a repository create synchronously with the created object, so there is no task
  // to wait on here; a missing href falls through to the 502 below.
  const repoHref = created.pulp_href ?? created.href ?? null;

  if (!repoHref) {
    return { ok: false, status: 502, detail: "Repository creation completed without repository href." };
  }

  return { ok: true, href: repoHref };
}

export const POST = withPulpAuth(async (request, auth) => {
  const body = (await request.json()) as AddToRepositoryBody;
  const repositoryName = body.repositoryName?.trim();
  const content = body.content?.trim();
  if (!repositoryName) {
    return Response.json({ detail: "Repository name is required." }, { status: 400 });
  }
  if (!content) {
    return Response.json({ detail: "Content href is required." }, { status: 400 });
  }

  const repoResult = await findOrCreateRepository(repositoryName, auth);
  if (!repoResult.ok) {
    throw new PulpApiError(repoResult.status, repoResult.detail);
  }

  const repositoryHref = repoResult.href;

  const modifyResult = await pulpFetch<TaskRefResponse>(
    `${normalizePulpHrefToApiPath(repositoryHref)}modify/`,
    auth,
    {
      method: "POST",
      body: JSON.stringify({
        add_content_units: [toPulpHrefPath(content)],
      }),
    }
  );

  if (!modifyResult.ok) {
    throw new PulpApiError(modifyResult.status, modifyResult.detail);
  }

  const modifyPayload = modifyResult.data;

  // Dispatch-and-return: the modify task href goes back to the UI to poll instead of being
  // waited on here.
  return Response.json({
    repository: repositoryHref,
    content: toPulpHrefPath(content),
    task: modifyPayload.task ?? null,
  });
});
