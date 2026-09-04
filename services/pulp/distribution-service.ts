import { readApiDetail } from "./http";
import type { PulpPluginKind } from "@/lib/pulp-plugins";
import {
  PulpDistribution,
  PulpDistributionDetail,
  PulpPaginatedResponse,
  ServiceResult,
  UpdatePulpDistributionPayload,
} from "./types";

export type CreateDistributionResult = {
  name: string;
  pulp_href: string | null;
  base_url: string | null;
  base_path: string;
  task: string | null;
};

/** Result of the plain POST /api/pulp/distributions create (already awaited server-side). */
export type CreatedDistribution = {
  pulp_href: string | null;
  name: string;
  base_path: string;
  base_url: string | null;
};

const DISTRIBUTIONS_PATH = "/api/pulp/distributions";

function encodeDistributionRef(pulpHref: string): string | null {
  const normalized = pulpHref.trim();
  if (normalized.length === 0) {
    return null;
  }

  return encodeURIComponent(normalized);
}

export const pulpDistributionService = {
  /** Repository-ensure flow: posts to create/[kind], which patches a distribution already
   * linked to the repository or creates one. Used by createForRepository below. */
  async create(
    kind: PulpPluginKind,
    payload: {
      repository: string;
      name: string;
      base_path: string;
    }
  ): Promise<CreateDistributionResult> {
    const response = await fetch(`/api/pulp/distributions/create/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }
    return (await response.json()) as CreateDistributionResult;
  },

  /**
   * Ensures a distribution for the repository: updates name/base_path if one is already
   * linked, otherwise creates it (`«name»-dist` / base_path = repo name).
   */
  async createForRepository(
    kind: PulpPluginKind,
    repositoryPulpHref: string,
    repositoryName: string
  ): Promise<CreateDistributionResult> {
    return pulpDistributionService.create(kind, {
      repository: repositoryPulpHref,
      name: `${repositoryName}-dist`,
      base_path: repositoryName,
    });
  },

  /** Used by app/repositories/list/page.tsx and app/distributions/list/page.tsx. */
  async list(params?: URLSearchParams): Promise<PulpPaginatedResponse<PulpDistribution>> {
    const qs = params?.toString();
    const response = await fetch(`${DISTRIBUTIONS_PATH}${qs ? `?${qs}` : ""}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpPaginatedResponse<PulpDistribution>;
  },

  /** Detail GET for the distribution edit modal — the only way to see the current `publication`. */
  async get(pulpHref: string): Promise<PulpDistributionDetail> {
    const encodedRef = encodeDistributionRef(pulpHref);
    if (!encodedRef) {
      throw new Error("Invalid distribution identifier.");
    }

    const response = await fetch(`${DISTRIBUTIONS_PATH}/${encodedRef}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpDistributionDetail;
  },

  /** Plain create for the distributions page's "New distribution" modal: always creates a
   * distribution for `kind`, bound to a repository, a publication, or neither. */
  async createDistribution(
    kind: PulpPluginKind,
    payload: {
      name: string;
      base_path: string;
      repository?: string | null;
      publication?: string | null;
      content_guard?: string | null;
    }
  ): Promise<CreatedDistribution> {
    const response = await fetch(DISTRIBUTIONS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ...payload }),
    });
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }
    return (await response.json()) as CreatedDistribution;
  },

  async update(
    pulpHref: string,
    payload: UpdatePulpDistributionPayload
  ): Promise<ServiceResult> {
    const encodedRef = encodeDistributionRef(pulpHref);
    if (!encodedRef) {
      return { ok: false, detail: "Invalid distribution identifier." };
    }

    const response = await fetch(`${DISTRIBUTIONS_PATH}/${encodedRef}`, {
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

  async remove(pulpHref: string): Promise<ServiceResult> {
    const encodedRef = encodeDistributionRef(pulpHref);
    if (!encodedRef) {
      return { ok: false, detail: "Invalid distribution identifier." };
    }

    const response = await fetch(`${DISTRIBUTIONS_PATH}/${encodedRef}`, {
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
