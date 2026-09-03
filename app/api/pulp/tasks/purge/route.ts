import { cookies } from "next/headers";
import { getPulpApiUrl, PULP_AUTH_COOKIE, toBasicAuthHeader } from "@/lib/pulp";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import { authHeaders, readDetail, waitForTask } from "../../repositories/_server";
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

export async function POST(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

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

  const authHeader = toBasicAuthHeader(authResult.auth);
  const headers = authHeaders(authHeader);
  headers.set("Content-Type", "application/json");

  const purgeResponse = await fetch(getPulpApiUrl("/tasks/purge/"), {
    method: "POST",
    headers,
    body: JSON.stringify({ finished_before: finishedBefore, states }),
    cache: "no-store",
  });

  if (!purgeResponse.ok) {
    if (purgeResponse.status === 401 || purgeResponse.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: await readDetail(purgeResponse) }, { status: purgeResponse.status });
  }

  const { task } = (await purgeResponse.json()) as { task: string };

  try {
    const finished = await waitForTask(task, authHeader);
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
}
