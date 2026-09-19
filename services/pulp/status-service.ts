import { readApiDetail } from "./http";
import { PulpStatusResponse } from "./types";

export const pulpStatusService = {
  async get(): Promise<PulpStatusResponse> {
    const response = await fetch("/api/pulp/status");
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpStatusResponse;
  },
};
