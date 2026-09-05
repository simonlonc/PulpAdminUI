import { readApiDetail } from "./http";
import { PulpSearchGroup } from "./types";

const SEARCH_PATH = "/api/pulp/search";

export const pulpSearchService = {
  async search(term: string, limit?: number): Promise<PulpSearchGroup[]> {
    const qs = new URLSearchParams({ search: term });
    if (limit) {
      qs.set("limit", String(limit));
    }
    const response = await fetch(`${SEARCH_PATH}?${qs}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    const data = (await response.json()) as { groups: PulpSearchGroup[] };
    return data.groups;
  },
};
