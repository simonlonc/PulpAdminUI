import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, readJsonBody, readStringArrayField, withPulpAuth } from "@/app/api/pulp/_helpers";
import { toPulpHrefPath } from "../_server";

type ReclaimBody = {
  repo_hrefs?: string[];
  repo_versions_keeplist?: string[];
};

export const POST = withPulpAuth(async (request, auth) => {
  const body = (await readJsonBody(request)) as ReclaimBody;

  const repoHrefs = readStringArrayField(body as Record<string, unknown>, "repo_hrefs");
  if (repoHrefs.length === 0) {
    return Response.json({ detail: "repo_hrefs is required." }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    repo_hrefs: repoHrefs.map((href) => (href === "*" ? href : toPulpHrefPath(href))),
  };
  const repoVersionsKeeplist = readStringArrayField(body as Record<string, unknown>, "repo_versions_keeplist");
  if (repoVersionsKeeplist.length > 0) {
    payload.repo_versions_keeplist = repoVersionsKeeplist.map((href) => toPulpHrefPath(href));
  }

  const reclaimResult = await pulpFetch<{ task: string }>("/repositories/reclaim_space/", auth, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!reclaimResult.ok) {
    throw new PulpApiError(reclaimResult.status, reclaimResult.detail);
  }

  const { task } = reclaimResult.data;

  // Dispatch-and-return: reclaiming across many repositories outlives an HTTP request, so the task
  // href goes back to the UI to poll and read the progress reports off.
  return Response.json({ task });
});
