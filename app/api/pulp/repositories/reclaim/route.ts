import { cookies } from "next/headers";
import { getPulpApiUrl, PULP_AUTH_COOKIE, toBasicAuthHeader } from "@/lib/pulp";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import { authHeaders, readDetail, toPulpHrefPath, waitForTask } from "../_server";

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

  const authHeader = toBasicAuthHeader(authResult.auth);
  const headers = authHeaders(authHeader);
  headers.set("Content-Type", "application/json");

  const payload: Record<string, unknown> = {
    repo_hrefs: body.repo_hrefs.map((href) => (href === "*" ? href : toPulpHrefPath(href))),
  };
  if (Array.isArray(body.repo_versions_keeplist) && body.repo_versions_keeplist.length > 0) {
    payload.repo_versions_keeplist = body.repo_versions_keeplist.map((href) => toPulpHrefPath(href));
  }

  const reclaimResponse = await fetch(getPulpApiUrl("/repositories/reclaim_space/"), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!reclaimResponse.ok) {
    if (reclaimResponse.status === 401 || reclaimResponse.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: await readDetail(reclaimResponse) }, { status: reclaimResponse.status });
  }

  const { task } = (await reclaimResponse.json()) as { task: string };

  try {
    const finished = await waitForTask(task, authHeader);
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
