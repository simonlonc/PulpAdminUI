import { readApiDetail } from "./http";
import { settleDispatchedTask } from "./task-service";
import { PulpReclaimSpaceResult, ServiceDataResult } from "./types";

/** What the route returns before the browser has polled the dispatched task. */
type ReclaimSpaceResponse = { task: string };

export const pulpReclaimService = {
  async reclaim(
    repoHrefs: string[],
    repoVersionsKeeplist: string[]
  ): Promise<ServiceDataResult<PulpReclaimSpaceResult>> {
    const payload: Record<string, unknown> = { repo_hrefs: repoHrefs };
    if (repoVersionsKeeplist.length > 0) {
      payload.repo_versions_keeplist = repoVersionsKeeplist;
    }

    const response = await fetch("/api/pulp/repositories/reclaim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }

    const data = (await response.json()) as ReclaimSpaceResponse;
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
};
