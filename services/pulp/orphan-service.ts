import { readApiDetail } from "./http";
import { settleDispatchedTask } from "./task-service";
import { PulpOrphanCleanupResult, ServiceDataResult } from "./types";

/** What the route returns before the browser has polled the dispatched task. */
type OrphanCleanupResponse = { task: string };

export const pulpOrphanService = {
  async cleanup(
    orphanProtectionTimeMinutes?: number
  ): Promise<ServiceDataResult<PulpOrphanCleanupResult>> {
    const response = await fetch("/api/pulp/orphans/cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orphan_protection_time: orphanProtectionTimeMinutes ?? null,
      }),
    });

    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }

    const data = (await response.json()) as OrphanCleanupResponse;
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
