import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import { toPulpHrefPath, waitForTask } from "../_server";

type ReclaimBody = {
  repo_hrefs?: string[];
  repo_versions_keeplist?: string[];
};

export const POST = withPulpAuth(async (request, auth) => {
  const body = (await request.json().catch(() => ({}))) as ReclaimBody;

  if (!Array.isArray(body.repo_hrefs) || body.repo_hrefs.length === 0) {
    return Response.json({ detail: "repo_hrefs is required." }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    repo_hrefs: body.repo_hrefs.map((href) => (href === "*" ? href : toPulpHrefPath(href))),
  };
  if (Array.isArray(body.repo_versions_keeplist) && body.repo_versions_keeplist.length > 0) {
    payload.repo_versions_keeplist = body.repo_versions_keeplist.map((href) => toPulpHrefPath(href));
  }

  const reclaimResult = await pulpFetch<{ task: string }>("/repositories/reclaim_space/", auth, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!reclaimResult.ok) {
    throw new PulpApiError(reclaimResult.status, reclaimResult.detail);
  }

  const { task } = reclaimResult.data;

  try {
    const finished = await waitForTask(task, auth);
    return Response.json({
      task,
      state: finished.state ?? "completed",
      progress_reports: finished.progress_reports ?? [],
    });
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "Reclaim space task failed." },
      { status: 500 }
    );
  }
});
