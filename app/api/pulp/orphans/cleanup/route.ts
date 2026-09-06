import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import { waitForTask } from "../../repositories/_server";

type CleanupBody = {
  orphan_protection_time?: number | null;
};

export async function POST(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const body = (await request.json().catch(() => ({}))) as CleanupBody;

  const payload: Record<string, unknown> = {};
  if (typeof body.orphan_protection_time === "number" && Number.isFinite(body.orphan_protection_time)) {
    payload.orphan_protection_time = body.orphan_protection_time;
  }

  const cleanupResult = await pulpFetch<{ task: string }>("/orphans/cleanup/", authResult.auth, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!cleanupResult.ok) {
    if (cleanupResult.status === 401 || cleanupResult.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: cleanupResult.detail }, { status: cleanupResult.status });
  }

  const { task } = cleanupResult.data;

  try {
    const finished = await waitForTask(task, authResult.auth);
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
}
