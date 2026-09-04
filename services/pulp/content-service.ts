import { readApiDetail } from "./http";
import { PulpContentItem, PulpPaginatedResponse, PulpRpmPackage } from "./types";

const CONTENT_PATH = "/api/pulp/content";

export const pulpContentService = {
  async list(params: URLSearchParams): Promise<PulpPaginatedResponse<PulpContentItem>> {
    const response = await fetch(`${CONTENT_PATH}?${params}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpPaginatedResponse<PulpContentItem>;
  },

  async getRpmPackage(id: string): Promise<PulpRpmPackage> {
    const response = await fetch(`/api/pulp/content/rpm/packages/${id}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpRpmPackage;
  },

  async getContentUnit(kind: string, id: string): Promise<Record<string, unknown>> {
    const response = await fetch(
      `/api/pulp/content/detail?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`
    );
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as Record<string, unknown>;
  },
};
