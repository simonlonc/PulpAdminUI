import { readApiDetail } from "./http";
import type { PulpPluginKind } from "@/lib/pulp-plugins";
import {
  PulpPaginatedResponse,
  PulpRemote,
  RemoteCreatePayload,
  RemoteUpdatePayload,
  ServiceDataResult,
  ServiceResult,
} from "./types";

function remotesPath(kind: PulpPluginKind): string {
  return `/api/pulp/remotes/${kind}`;
}

export const pulpRemoteService = {
  async list(
    kind: PulpPluginKind,
    params?: URLSearchParams
  ): Promise<PulpPaginatedResponse<PulpRemote>> {
    const qs = params?.toString();
    const response = await fetch(`${remotesPath(kind)}${qs ? `?${qs}` : ""}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpPaginatedResponse<PulpRemote>;
  },

  async create(
    kind: PulpPluginKind,
    payload: RemoteCreatePayload
  ): Promise<ServiceDataResult<PulpRemote>> {
    const response = await fetch(remotesPath(kind), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }
    return { ok: true, data: (await response.json()) as PulpRemote };
  },

  async update(
    kind: PulpPluginKind,
    pulpHref: string,
    payload: RemoteUpdatePayload
  ): Promise<ServiceResult> {
    const response = await fetch(remotesPath(kind), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, pulp_href: pulpHref }),
    });
    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }
    return { ok: true };
  },

  async remove(kind: PulpPluginKind, pulpHref: string): Promise<ServiceResult> {
    const response = await fetch(remotesPath(kind), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pulp_href: pulpHref }),
    });
    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }
    return { ok: true };
  },
};
