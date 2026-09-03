import { readApiDetail } from "./http";
import { ServiceResult } from "./types";

const LABELS_PATH = "/api/pulp/labels";

export const pulpLabelService = {
  async setLabel(pulpHref: string, key: string, value: string): Promise<ServiceResult> {
    const response = await fetch(LABELS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pulp_href: pulpHref, key, value }),
    });

    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }

    return { ok: true };
  },

  async unsetLabel(pulpHref: string, key: string): Promise<ServiceResult> {
    const response = await fetch(LABELS_PATH, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pulp_href: pulpHref, key }),
    });

    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }

    return { ok: true };
  },

  /**
   * Pulp has no bulk label endpoint: diffs `previous` against `next` and issues one
   * request per change (unset for removed keys, set for added/changed values; unchanged
   * values are skipped). Stops at the first failure.
   */
  async saveLabels(
    pulpHref: string,
    previous: Record<string, string>,
    next: Record<string, string>
  ): Promise<ServiceResult> {
    for (const key of Object.keys(previous)) {
      if (!(key in next)) {
        const result = await pulpLabelService.unsetLabel(pulpHref, key);
        if (!result.ok) {
          return result;
        }
      }
    }

    for (const [key, value] of Object.entries(next)) {
      if (previous[key] !== value) {
        const result = await pulpLabelService.setLabel(pulpHref, key, value);
        if (!result.ok) {
          return result;
        }
      }
    }

    return { ok: true };
  },
};
