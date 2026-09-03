import { readApiDetail } from "./http";
import { PulpPaginatedResponse, PulpTaskGroup } from "./types";

const TASK_GROUPS_PATH = "/api/pulp/task-groups";

export const pulpTaskGroupService = {
  async list(params: { limit: number; offset: number }): Promise<PulpPaginatedResponse<PulpTaskGroup>> {
    const qs = new URLSearchParams({
      limit: String(params.limit),
      offset: String(params.offset),
    });
    const response = await fetch(`${TASK_GROUPS_PATH}?${qs}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpPaginatedResponse<PulpTaskGroup>;
  },

  async get(pulpHref: string): Promise<PulpTaskGroup> {
    const qs = new URLSearchParams({ pulp_href: pulpHref });
    const response = await fetch(`${TASK_GROUPS_PATH}?${qs}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpTaskGroup;
  },
};
