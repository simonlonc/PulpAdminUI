import { readApiDetail } from "./http";
import { settleDispatchedTask } from "./task-service";
import type { PulpPluginKind } from "@/lib/pulp-plugins";
import {
  PulpPaginatedResponse,
  PulpRemote,
  RemoteCreatePayload,
  RemoteUpdatePayload,
  ServiceDataResult,
  ServiceResult,
} from "./types";

/** What the update and delete routes return before the browser has polled the dispatched task. */
type RemoteWriteResponse = { task: string | null };

export type PulpRemoteSummary = Pick<PulpRemote, "pulp_href" | "name" | "url">;

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

  /**
   * Every remote of every plugin kind, from Pulp's generic list. The route follows Pulp's pages,
   * so this is one request instead of one per kind.
   */
  async listAll(): Promise<PulpRemoteSummary[]> {
    const response = await fetch("/api/pulp/remotes");
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return ((await response.json()) as PulpPaginatedResponse<PulpRemoteSummary>).results;
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

    const data = (await response.json()) as RemoteWriteResponse;
    const settled = await settleDispatchedTask(data.task);
    if (!settled.ok) return { ok: false, detail: settled.detail };

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

    const data = (await response.json()) as RemoteWriteResponse;
    const settled = await settleDispatchedTask(data.task);
    if (!settled.ok) return { ok: false, detail: settled.detail };

    return { ok: true };
  },
};
