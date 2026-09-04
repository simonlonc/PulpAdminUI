import { readApiDetail } from "./http";
import { PulpPaginatedResponse, PulpPublication, ServiceResult } from "./types";

const PUBLICATIONS_PATH = "/api/pulp/publications";

function encodePublicationRef(pulpHref: string): string | null {
  const normalized = pulpHref.trim();
  if (normalized.length === 0) {
    return null;
  }

  return encodeURIComponent(normalized);
}

export const pulpPublicationService = {
  /** Paginated list for app/publications/list/page.tsx, driven by usePulpListQuery. */
  async listPaged(params: URLSearchParams): Promise<PulpPaginatedResponse<PulpPublication>> {
    const response = await fetch(`${PUBLICATIONS_PATH}?${params}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpPaginatedResponse<PulpPublication>;
  },

  async remove(pulpHref: string): Promise<ServiceResult> {
    const encodedRef = encodePublicationRef(pulpHref);
    if (!encodedRef) {
      return { ok: false, detail: "Invalid publication identifier." };
    }

    const response = await fetch(`${PUBLICATIONS_PATH}/${encodedRef}`, {
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
