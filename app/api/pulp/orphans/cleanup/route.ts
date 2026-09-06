import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import { waitForTask } from "../../repositories/_server";

type CleanupBody = {
  orphan_protection_time?: number | null;
};

export const POST = withPulpAuth(async (request, auth) => {
  const body = (await request.json().catch(() => ({}))) as CleanupBody;

  const payload: Record<string, unknown> = {};
  if (typeof body.orphan_protection_time === "number" && Number.isFinite(body.orphan_protection_time)) {
    payload.orphan_protection_time = body.orphan_protection_time;
  }

  const cleanupResult = await pulpFetch<{ task: string }>("/orphans/cleanup/", auth, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!cleanupResult.ok) {
    throw new PulpApiError(cleanupResult.status, cleanupResult.detail);
  }

  const { task } = cleanupResult.data;

  try {
    const finished = await waitForTask(task, auth);
    return Response.json({
      task,
      state: finished.state ?? "completed",
      progress_reports: finished.progress_reports ?? [],
    });
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "Orphan cleanup task failed." },
      { status: 500 }
    );
  }
});
