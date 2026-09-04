import { readApiDetail } from "./http";
import { PulpContentGuard, PulpPaginatedResponse } from "./types";

const CONTENTGUARDS_PATH = "/api/pulp/contentguards";

export const pulpContentGuardService = {
  /** Read-only list for the distribution edit/create modals' content-guard picker. */
  async list(params?: URLSearchParams): Promise<PulpPaginatedResponse<PulpContentGuard>> {
    const qs = params?.toString();
    const response = await fetch(`${CONTENTGUARDS_PATH}${qs ? `?${qs}` : ""}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpPaginatedResponse<PulpContentGuard>;
  },
};
