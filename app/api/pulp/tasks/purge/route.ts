import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import { waitForTask } from "../../repositories/_server";
import type { PulpTaskPurgeState } from "@/services/pulp/types";

const PURGE_STATES = ["skipped", "completed", "failed", "canceled"] as const;

type PurgeBody = {
  finished_before?: string;
  states?: string[];
};

function normalizeStates(value: unknown): PulpTaskPurgeState[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is PulpTaskPurgeState =>
    typeof item === "string" && (PURGE_STATES as readonly string[]).includes(item)
  );
}

export const POST = withPulpAuth(async (request, auth) => {
  const body = (await request.json().catch(() => ({}))) as PurgeBody;

  const finishedBefore = body.finished_before?.trim();
  if (!finishedBefore) {
    return Response.json({ detail: "A finished before date is required." }, { status: 400 });
  }
  if (Number.isNaN(new Date(finishedBefore).getTime())) {
    return Response.json({ detail: "Invalid finished before date." }, { status: 400 });
  }

  const states = normalizeStates(body.states);
  if (states.length === 0) {
    return Response.json({ detail: "At least one task state must be selected." }, { status: 400 });
  }

  const purgeResult = await pulpFetch<{ task: string }>("/tasks/purge/", auth, {
    method: "POST",
    body: JSON.stringify({ finished_before: finishedBefore, states }),
  });

  if (!purgeResult.ok) {
    throw new PulpApiError(purgeResult.status, purgeResult.detail);
  }

  const { task } = purgeResult.data;

  try {
    const finished = await waitForTask(task, auth);
    return Response.json({
      task,
      state: finished.state ?? "completed",
      progress_reports: finished.progress_reports ?? [],
    });
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "Task purge failed." },
      { status: 500 }
    );
  }
});
