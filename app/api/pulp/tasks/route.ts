import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../_helpers";
import { buildUpstreamListParams, normalizePulpHrefToApiPath } from "../repositories/_server";
import { PulpPaginatedResponse, PulpTask } from "@/services/pulp/types";

/** Task-specific list params /tasks/ accepts beyond the shared ordering/label allowlist. */
const TASK_LIST_PARAMS = [
  "name__contains",
  "state",
  "started_at__gte",
  "started_at__lte",
  "finished_at__gte",
  "finished_at__lte",
] as const;

/** Tasks default to a smaller page (100) and a hard cap (500) than the shared list default. */
function clampLimit(value: string | null): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(500, n) : 100;
}

export const GET = withPulpAuth(async (request, auth) => {
  const url = new URL(request.url);
  const qs = buildUpstreamListParams(url.searchParams, TASK_LIST_PARAMS);
  qs.set("limit", String(clampLimit(url.searchParams.get("limit"))));

  const result = await pulpFetch<PulpPaginatedResponse<PulpTask>>(
    `/tasks/?${qs.toString()}`,
    auth
  );

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});

type CancelBody = {
  pulp_href?: string;
};

function isTaskApiPath(path: string): boolean {
  return path.includes("/tasks/");
}

export const PATCH = withPulpAuth(async (request, auth) => {
  const body = (await request.json()) as CancelBody;
  const pulpHref = body.pulp_href?.trim();
  if (!pulpHref) {
    return Response.json({ detail: "pulp_href is required." }, { status: 400 });
  }

  const apiPath = normalizePulpHrefToApiPath(pulpHref);
  if (!isTaskApiPath(apiPath)) {
    return Response.json({ detail: "Not a task href." }, { status: 400 });
  }

  // PatchedTaskCancel only accepts "canceled"; Pulp answers 409 for tasks that already finished.
  const result = await pulpFetch<PulpTask>(apiPath, auth, {
    method: "PATCH",
    body: JSON.stringify({ state: "canceled" }),
  });

  if (!result.ok) {
    // On 409 Pulp returns the task itself, not an error body, so build a readable message.
    if (result.status === 409) {
      return Response.json(
        { detail: "Task is no longer running and cannot be canceled." },
        { status: 409 }
      );
    }

    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});
