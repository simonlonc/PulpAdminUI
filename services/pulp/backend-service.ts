import { readApiDetail } from "./http";
import { PulpBackend, SavePulpBackendPayload, ServiceResult } from "./types";

const BACKENDS_PATH = "/api/pulp/backends/manage";

export const pulpBackendService = {
  async list(): Promise<PulpBackend[]> {
    const response = await fetch(BACKENDS_PATH);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpBackend[];
  },

  async create(payload: SavePulpBackendPayload): Promise<ServiceResult> {
    const response = await fetch(BACKENDS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        ok: false,
        detail: await readApiDetail(response),
      };
    }

    return { ok: true };
  },

  async update(id: string, payload: SavePulpBackendPayload): Promise<ServiceResult> {
    const response = await fetch(`${BACKENDS_PATH}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        ok: false,
        detail: await readApiDetail(response),
      };
    }

    return { ok: true };
  },

  async remove(id: string): Promise<ServiceResult> {
    const response = await fetch(`${BACKENDS_PATH}/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      return {
        ok: false,
        detail: await readApiDetail(response),
      };
    }

    return { ok: true };
  },
};
