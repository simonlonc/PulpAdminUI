import { hrefFromCreatedResource } from "@/lib/pulp-task-result";
import { readApiDetail } from "./http";
import { settleDispatchedTask } from "./task-service";
import type { PulpPluginKind } from "@/lib/pulp-plugins";
import {
  PulpDistribution,
  PulpDistributionDetail,
  PulpPaginatedResponse,
  ServiceDataResult,
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

/** Result of the plain POST /api/pulp/distributions create, once the dispatched task settled. */
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

type DistributionWriteResponse = {
  pulp_href: string | null;
  name: string;
  base_path: string;
  base_url: string | null;
  task: string | null;
};

/** What the update and delete routes return before the browser has polled the dispatched task. */
type DistributionTaskResponse = { task: string | null };

/**
 * Waits for the dispatched write, then re-reads the distribution so the caller
 * gets the fields only Pulp can fill (base_url above all). The routes used to do
 * both server-side; a failed detail read costs only those fields, exactly as it
 * did there.
 */
async function settleDistributionWrite(
  raw: DistributionWriteResponse
): Promise<ServiceDataResult<CreateDistributionResult>> {
  const settled = await settleDispatchedTask(raw.task);
  if (!settled.ok) return { ok: false, detail: settled.detail };

  const pulpHref = settled.task
    ? (hrefFromCreatedResource(settled.task.created_resources?.[0]) ?? raw.pulp_href)
    : raw.pulp_href;

  let baseUrl = raw.base_url;
  let name = raw.name;
  let basePath = raw.base_path;
  if (pulpHref) {
    try {
      const detail = await pulpDistributionService.get(pulpHref);
      baseUrl = detail.base_url ?? baseUrl;
      name = detail.name ?? name;
      basePath = detail.base_path ?? basePath;
    } catch {
      // The write succeeded; only the enriched fields are missing.
    }
  }

  return {
    ok: true,
    data: { name, pulp_href: pulpHref, base_url: baseUrl, base_path: basePath, task: raw.task },
  };
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
  ): Promise<ServiceDataResult<CreateDistributionResult>> {
    const response = await fetch(`/api/pulp/distributions/create/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }
    return settleDistributionWrite((await response.json()) as DistributionWriteResponse);
  },

  /**
   * Ensures a distribution for the repository: updates name/base_path if one is already
   * linked, otherwise creates it (`«name»-dist` / base_path = repo name).
   */
  async createForRepository(
    kind: PulpPluginKind,
    repositoryPulpHref: string,
    repositoryName: string
  ): Promise<ServiceDataResult<CreateDistributionResult>> {
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
  ): Promise<ServiceDataResult<CreatedDistribution>> {
    const response = await fetch(DISTRIBUTIONS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ...payload }),
    });
    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }

    const settled = await settleDistributionWrite(
      (await response.json()) as DistributionWriteResponse
    );
    if (!settled.ok) {
      return { ok: false, detail: settled.detail };
    }

    const { pulp_href, name, base_path, base_url } = settled.data;
    return { ok: true, data: { pulp_href, name, base_path, base_url } };
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

    const data = (await response.json()) as DistributionTaskResponse;
    const settled = await settleDispatchedTask(data.task);
    if (!settled.ok) {
      return { ok: false, detail: settled.detail };
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

    const data = (await response.json()) as DistributionTaskResponse;
    const settled = await settleDispatchedTask(data.task);
    if (!settled.ok) {
      return { ok: false, detail: settled.detail };
    }

    return { ok: true };
  },
};
