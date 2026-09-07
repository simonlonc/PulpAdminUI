import { isPulpTaskFinished, pulpTaskFailureMessage } from "@/lib/pulp-task-result";
import { readApiDetail } from "./http";
import {
  PulpPaginatedResponse,
  PulpTask,
  PulpTaskPurgePayload,
  PulpTaskPurgeResult,
  ServiceDataResult,
} from "./types";

const TASKS_PATH = "/api/pulp/tasks";

/** What the route returns before the browser has polled the dispatched task. */
type TaskPurgeResponse = { task: string };

export const pulpTaskService = {
  async list(params: URLSearchParams): Promise<PulpPaginatedResponse<PulpTask>> {
    const response = await fetch(`${TASKS_PATH}?${params}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpPaginatedResponse<PulpTask>;
  },

  async get(pulpHref: string): Promise<PulpTask> {
    const qs = new URLSearchParams({ pulp_href: pulpHref });
    const response = await fetch(`${TASKS_PATH}/detail?${qs}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpTask;
  },

  async cancel(pulpHref: string): Promise<ServiceDataResult<PulpTask>> {
    const response = await fetch(TASKS_PATH, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pulp_href: pulpHref }),
    });
    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }

    return { ok: true, data: (await response.json()) as PulpTask };
  },

  async purge(payload: PulpTaskPurgePayload): Promise<ServiceDataResult<PulpTaskPurgeResult>> {
    const response = await fetch(`${TASKS_PATH}/purge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }

    const data = (await response.json()) as TaskPurgeResponse;
    const settled = await settleDispatchedTask(data.task);
    if (!settled.ok) return { ok: false, detail: settled.detail };

    return {
      ok: true,
      data: {
        task: data.task,
        state: settled.task?.state ?? "completed",
        progress_reports: settled.task?.progress_reports ?? [],
      },
    };
  },

  /**
   * Polls a task from the browser until it reaches a terminal state, replacing the
   * server-side wait loop routes used to block a request on. No attempt cap: the old cap
   * existed to protect a blocked server worker, and there is nothing to protect here;
   * capping would reintroduce the exact bug this removes, a slow-but-successful task
   * reported as failed because polling gave up on it.
   */
  async awaitTask(pulpHref: string, options?: { intervalMs?: number }): Promise<PulpTask> {
    const intervalMs = options?.intervalMs ?? 5000;

    for (;;) {
      const task = await pulpTaskService.get(pulpHref);
      if (isPulpTaskFinished(task.state)) {
        const failureMessage = pulpTaskFailureMessage(task);
        if (failureMessage) {
          throw new Error(failureMessage);
        }
        return task;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  },
};

/**
 * Waits in the browser for a task a route dispatched and returned, so a long
 * operation is not bounded by an HTTP request's lifetime. `task` is null when
 * the route completed synchronously (Pulp answered 200 rather than 202), in
 * which case there is nothing to wait for.
 */
export async function settleDispatchedTask(
  task: string | null | undefined
): Promise<{ ok: true; task: PulpTask | null } | { ok: false; detail: string }> {
  if (!task) return { ok: true, task: null };
  try {
    return { ok: true, task: await pulpTaskService.awaitTask(task) };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "Task failed." };
  }
}
