import { readApiDetail } from "./http";
import { PulpStatus } from "./types";

export const pulpStatusService = {
  async get(): Promise<PulpStatus> {
    const response = await fetch("/api/pulp/status");
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpStatus;
  },
};
