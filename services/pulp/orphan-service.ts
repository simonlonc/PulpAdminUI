import { readApiDetail } from "./http";
import { PulpOrphanCleanupResult, ServiceDataResult } from "./types";

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

    return { ok: true, data: (await response.json()) as PulpOrphanCleanupResult };
  },
};
