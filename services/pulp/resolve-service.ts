import { readApiDetail } from "./http";
import { PulpResolvedResource } from "./types";

const RESOLVE_PATH = "/api/pulp/resolve";

export const pulpResolveService = {
  async resolve(ref: string): Promise<PulpResolvedResource> {
    const qs = new URLSearchParams({ ref });
    const response = await fetch(`${RESOLVE_PATH}?${qs}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpResolvedResource;
  },
};
