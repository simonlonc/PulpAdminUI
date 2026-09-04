import { readApiDetail } from "./http";
import { PulpReclaimSpaceResult } from "./types";

export const pulpReclaimService = {
  async reclaim(repoHrefs: string[], repoVersionsKeeplist: string[]): Promise<PulpReclaimSpaceResult> {
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
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpReclaimSpaceResult;
  },
};
