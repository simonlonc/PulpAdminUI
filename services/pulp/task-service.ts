import { readApiDetail } from "./http";
import {
  PulpPaginatedResponse,
  PulpTask,
  PulpTaskPurgePayload,
  PulpTaskPurgeResult,
} from "./types";

const TASKS_PATH = "/api/pulp/tasks";

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

  async cancel(pulpHref: string): Promise<PulpTask> {
    const response = await fetch(TASKS_PATH, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pulp_href: pulpHref }),
    });
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpTask;
  },

  async purge(payload: PulpTaskPurgePayload): Promise<PulpTaskPurgeResult> {
    const response = await fetch(`${TASKS_PATH}/purge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpTaskPurgeResult;
  },
};
