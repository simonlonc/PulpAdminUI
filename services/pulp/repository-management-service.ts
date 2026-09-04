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
  PulpRepositoryVersion,
  RepositoryVersionsListResult,
  RepositoryVersionRepairResult,
  RepositoryModifyPayload,
  RepositoryModifyResult,
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

  async listRepositoryContent(
    pulpHref: string,
    contentPath?: string
  ): Promise<RepositoryContentListResult> {
    const contentPathQuery = contentPath ? `&content_path=${encodeURIComponent(contentPath)}` : "";
    const response = await fetch(
      `/api/pulp/repositories/content?pulp_href=${encodeURIComponent(pulpHref)}${contentPathQuery}`
    );
    if (!response.ok) throw new Error(await readApiDetail(response));
    return (await response.json()) as RepositoryContentListResult;
  },

  async listRepositoryVersions(
    kind: PulpPluginKind,
    pulpHref: string
  ): Promise<RepositoryVersionsListResult> {
    const response = await fetch(
      `/api/pulp/repositories/${kind}/versions?pulp_href=${encodeURIComponent(pulpHref)}`
    );
    if (!response.ok) throw new Error(await readApiDetail(response));
    return (await response.json()) as RepositoryVersionsListResult;
  },

  async getRepositoryVersion(
    kind: PulpPluginKind,
    versionPulpHref: string
  ): Promise<PulpRepositoryVersion> {
    const response = await fetch(
      `/api/pulp/repositories/${kind}/version?pulp_href=${encodeURIComponent(versionPulpHref)}`
    );
    if (!response.ok) throw new Error(await readApiDetail(response));
    return (await response.json()) as PulpRepositoryVersion;
  },

  async deleteRepositoryVersion(kind: PulpPluginKind, versionPulpHref: string): Promise<void> {
    const response = await fetch(`/api/pulp/repositories/${kind}/version`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pulp_href: versionPulpHref }),
    });
    if (!response.ok) throw new Error(await readApiDetail(response));
  },

  async repairRepositoryVersion(
    kind: PulpPluginKind,
    versionPulpHref: string,
    verifyChecksums: boolean
  ): Promise<RepositoryVersionRepairResult> {
    const response = await fetch(`/api/pulp/repositories/${kind}/version/repair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pulp_href: versionPulpHref, verify_checksums: verifyChecksums }),
    });
    if (!response.ok) throw new Error(await readApiDetail(response));
    return (await response.json()) as RepositoryVersionRepairResult;
  },

  async modifyRepository(
    kind: PulpPluginKind,
    pulpHref: string,
    payload: RepositoryModifyPayload
  ): Promise<RepositoryModifyResult> {
    const response = await fetch(`/api/pulp/repositories/${kind}/modify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pulp_href: pulpHref, ...payload }),
    });
    if (!response.ok) throw new Error(await readApiDetail(response));
    return (await response.json()) as RepositoryModifyResult;
  },
};
