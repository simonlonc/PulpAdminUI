import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import { toPulpHrefPath, waitForTask } from "../_server";

type ReclaimBody = {
  repo_hrefs?: string[];
  repo_versions_keeplist?: string[];
};

export async function POST(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

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

  const reclaimResult = await pulpFetch<{ task: string }>("/repositories/reclaim_space/", authResult.auth, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!reclaimResult.ok) {
    if (reclaimResult.status === 401 || reclaimResult.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: reclaimResult.detail }, { status: reclaimResult.status });
  }

  const { task } = reclaimResult.data;

  try {
    const finished = await waitForTask(task, authResult.auth);
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
}
