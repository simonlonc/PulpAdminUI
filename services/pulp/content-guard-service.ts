import { readApiDetail } from "./http";
import {
  CreatePulpContentGuardPayload,
  PulpContentGuard,
  PulpContentGuardDetail,
  PulpPaginatedResponse,
  ServiceDataResult,
  ServiceResult,
  UpdatePulpContentGuardPayload,
} from "./types";

const CONTENTGUARDS_PATH = "/api/pulp/contentguards";

function encodeContentGuardRef(pulpHref: string): string | null {
  const normalized = pulpHref.trim();
  if (normalized.length === 0) {
    return null;
  }

  return encodeURIComponent(normalized);
}

export const pulpContentGuardService = {
  /** Used by the distribution edit/create modals' content-guard picker, and the content
   * guards list page. */
  async list(params?: URLSearchParams): Promise<PulpPaginatedResponse<PulpContentGuard>> {
    const qs = params?.toString();
    const response = await fetch(`${CONTENTGUARDS_PATH}${qs ? `?${qs}` : ""}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpPaginatedResponse<PulpContentGuard>;
  },

  /** Detail GET for the content guard edit modal — the only way to see the per-type fields. */
  async get(pulpHref: string): Promise<PulpContentGuardDetail> {
    const encodedRef = encodeContentGuardRef(pulpHref);
    if (!encodedRef) {
      throw new Error("Invalid content guard identifier.");
    }

    const response = await fetch(`${CONTENTGUARDS_PATH}/${encodedRef}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpContentGuardDetail;
  },

  async create(
    payload: CreatePulpContentGuardPayload
  ): Promise<ServiceDataResult<PulpContentGuard>> {
    const response = await fetch(CONTENTGUARDS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }
    return { ok: true, data: (await response.json()) as PulpContentGuard };
  },

  async update(
    pulpHref: string,
    payload: UpdatePulpContentGuardPayload
  ): Promise<ServiceResult> {
    const encodedRef = encodeContentGuardRef(pulpHref);
    if (!encodedRef) {
      return { ok: false, detail: "Invalid content guard identifier." };
    }

    const response = await fetch(`${CONTENTGUARDS_PATH}/${encodedRef}`, {
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
    const encodedRef = encodeContentGuardRef(pulpHref);
    if (!encodedRef) {
      return { ok: false, detail: "Invalid content guard identifier." };
    }

    const response = await fetch(`${CONTENTGUARDS_PATH}/${encodedRef}`, {
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
