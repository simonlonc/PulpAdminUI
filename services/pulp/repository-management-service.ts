import { readApiDetail } from "./http";
import type { PulpPluginKind } from "@/lib/pulp-plugins";
import {
  PulpPaginatedResponse,
  PulpRepository,
  PulpRepositoryDetail,
  RepositoryCreatePayload,
  RepositorySyncPayload,
  RepositorySyncResult,
  RepositoryUpdatePayload,
  PulpRpmRepositoryVersion,
  RpmRepositoryVersionsListResult,
} from "./types";

export type RepositoryPublishResult = {
  publication: string | null;
  repository: string;
  task: string | null;
};

export type RepositoryCreateResult = {
  name: string;
  pulp_href: string | null;
  task: string | null;
};

export type RepositoryContentListResult = {
  count: number;
  totalSizeBytes: number | null;
  results: Record<string, unknown>[];
};

export type RepositoryUpdateResult = {
  ok: true;
  name: string;
};

export const pulpRepositoryManagementService = {
  async list(
    kind: PulpPluginKind,
    params?: URLSearchParams
  ): Promise<PulpPaginatedResponse<PulpRepository>> {
    const qs = params?.toString();
    const response = await fetch(`/api/pulp/repositories/${kind}${qs ? `?${qs}` : ""}`);
    if (!response.ok) throw new Error(await readApiDetail(response));
    return (await response.json()) as PulpPaginatedResponse<PulpRepository>;
  },

  async create(
    kind: PulpPluginKind,
    payload: RepositoryCreatePayload
  ): Promise<RepositoryCreateResult> {
    const response = await fetch(`/api/pulp/repositories/${kind}/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await readApiDetail(response));
    return (await response.json()) as RepositoryCreateResult;
  },

  async getRepositoryDetail(pulpHref: string): Promise<PulpRepositoryDetail> {
    const response = await fetch(
      `/api/pulp/repositories/detail?pulp_href=${encodeURIComponent(pulpHref)}`
    );
    if (!response.ok) throw new Error(await readApiDetail(response));
    return (await response.json()) as PulpRepositoryDetail;
  },

  async update(
    kind: PulpPluginKind,
    pulpHref: string,
    payload: RepositoryUpdatePayload
  ): Promise<RepositoryUpdateResult> {
    const response = await fetch(`/api/pulp/repositories/${kind}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pulp_href: pulpHref, ...payload }),
    });
    if (!response.ok) throw new Error(await readApiDetail(response));
    return (await response.json()) as RepositoryUpdateResult;
  },

  async remove(kind: PulpPluginKind, pulpHref: string): Promise<void> {
    const response = await fetch(`/api/pulp/repositories/${kind}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pulp_href: pulpHref }),
    });
    if (!response.ok) throw new Error(await readApiDetail(response));
  },

  async sync(
    kind: PulpPluginKind,
    payload: RepositorySyncPayload
  ): Promise<RepositorySyncResult> {
    const response = await fetch(`/api/pulp/repositories/${kind}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await readApiDetail(response));
    return (await response.json()) as RepositorySyncResult;
  },

  async publish(kind: PulpPluginKind, pulpHref: string): Promise<RepositoryPublishResult> {
    const response = await fetch(`/api/pulp/repositories/${kind}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pulp_href: pulpHref }),
    });
    if (!response.ok) throw new Error(await readApiDetail(response));
    return (await response.json()) as RepositoryPublishResult;
  },

  async listRepositoryContent(pulpHref: string): Promise<RepositoryContentListResult> {
    const response = await fetch(
      `/api/pulp/repositories/content?pulp_href=${encodeURIComponent(pulpHref)}`
    );
    if (!response.ok) throw new Error(await readApiDetail(response));
    return (await response.json()) as RepositoryContentListResult;
  },

  async listRpmRepositoryVersions(pulpHref: string): Promise<RpmRepositoryVersionsListResult> {
    const response = await fetch(
      `/api/pulp/repositories/rpm/versions?pulp_href=${encodeURIComponent(pulpHref)}`
    );
    if (!response.ok) throw new Error(await readApiDetail(response));
    return (await response.json()) as RpmRepositoryVersionsListResult;
  },

  async getRpmRepositoryVersion(versionPulpHref: string): Promise<PulpRpmRepositoryVersion> {
    const response = await fetch(
      `/api/pulp/repositories/rpm/version?pulp_href=${encodeURIComponent(versionPulpHref)}`
    );
    if (!response.ok) throw new Error(await readApiDetail(response));
    return (await response.json()) as PulpRpmRepositoryVersion;
  },

  async deleteRpmRepositoryVersion(versionPulpHref: string): Promise<void> {
    const response = await fetch("/api/pulp/repositories/rpm/version", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pulp_href: versionPulpHref }),
    });
    if (!response.ok) throw new Error(await readApiDetail(response));
  },
};
