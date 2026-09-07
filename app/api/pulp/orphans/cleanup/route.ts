import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";

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

  // Dispatch-and-return: cleaning up a large orphan set outlives an HTTP request, so the task
  // href goes back to the UI to poll and read the progress reports off.
  return Response.json({ task });
});
