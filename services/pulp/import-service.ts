import { readApiDetail } from "./http";
import {
  CreatePulpImporterPayload,
  PulpImport,
  PulpImportCheckPayload,
  PulpImportCheckResult,
  PulpImporter,
  PulpPaginatedResponse,
  RunPulpImportPayload,
  RunPulpImportResult,
  ServiceDataResult,
  ServiceResult,
  UpdatePulpImporterPayload,
} from "./types";

const IMPORTERS_PATH = "/api/pulp/importers/pulp";

/** An import href is `{importer_href}imports/{id}/`; capture group 1 is the importer href. */
const IMPORT_HREF_PATTERN = /^(.*\/)imports\/[^/]+\/?$/;

function encodeImporterRef(pulpHref: string): string | null {
  const normalized = pulpHref.trim();
  if (normalized.length === 0) {
    return null;
  }

  return encodeURIComponent(normalized);
}

export const pulpImportService = {
  async list(params?: URLSearchParams): Promise<PulpPaginatedResponse<PulpImporter>> {
    const qs = params?.toString();
    const response = await fetch(`${IMPORTERS_PATH}${qs ? `?${qs}` : ""}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpPaginatedResponse<PulpImporter>;
  },

  async get(pulpHref: string): Promise<PulpImporter> {
    const encodedRef = encodeImporterRef(pulpHref);
    if (!encodedRef) {
      throw new Error("Invalid importer identifier.");
    }

    const response = await fetch(`${IMPORTERS_PATH}/${encodedRef}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpImporter;
  },

  async create(payload: CreatePulpImporterPayload): Promise<ServiceDataResult<PulpImporter>> {
    const response = await fetch(IMPORTERS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }
    return { ok: true, data: (await response.json()) as PulpImporter };
  },

  /** An importer update is synchronous, so there is no task to settle. */
  async update(pulpHref: string, payload: UpdatePulpImporterPayload): Promise<ServiceResult> {
    const encodedRef = encodeImporterRef(pulpHref);
    if (!encodedRef) {
      return { ok: false, detail: "Invalid importer identifier." };
    }

    const response = await fetch(`${IMPORTERS_PATH}/${encodedRef}`, {
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
    const encodedRef = encodeImporterRef(pulpHref);
    if (!encodedRef) {
      return { ok: false, detail: "Invalid importer identifier." };
    }

    const response = await fetch(`${IMPORTERS_PATH}/${encodedRef}`, {
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

  /** The import history of one importer: GET {importer_href}imports/. */
  async listImports(
    importerHref: string,
    params?: URLSearchParams
  ): Promise<PulpPaginatedResponse<PulpImport>> {
    const encodedRef = encodeImporterRef(importerHref);
    if (!encodedRef) {
      throw new Error("Invalid importer identifier.");
    }

    const qs = params?.toString();
    const response = await fetch(`${IMPORTERS_PATH}/${encodedRef}/imports${qs ? `?${qs}` : ""}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpPaginatedResponse<PulpImport>;
  },

  /**
   * Dispatches an import and returns its task group href WITHOUT waiting for it: an import runs
   * one task per repository and can take a long time, so the UI links to
   * /task-groups/detail?pulp_href=... instead of blocking on it.
   */
  async runImport(
    importerHref: string,
    payload: RunPulpImportPayload
  ): Promise<ServiceDataResult<RunPulpImportResult>> {
    const encodedRef = encodeImporterRef(importerHref);
    if (!encodedRef) {
      return { ok: false, detail: "Invalid importer identifier." };
    }

    const response = await fetch(`${IMPORTERS_PATH}/${encodedRef}/imports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }

    return { ok: true, data: (await response.json()) as RunPulpImportResult };
  },

  async removeImport(importHref: string): Promise<ServiceResult> {
    const normalized = importHref.trim();
    const match = normalized.match(IMPORT_HREF_PATTERN);
    if (!match) {
      return { ok: false, detail: "Invalid import identifier." };
    }

    const response = await fetch(
      `${IMPORTERS_PATH}/${encodeURIComponent(match[1])}/imports/${encodeURIComponent(normalized)}`,
      { method: "DELETE" }
    );

    if (!response.ok) {
      return {
        ok: false,
        detail: await readApiDetail(response),
      };
    }

    return { ok: true };
  },

  /**
   * Pre-flight check of a proposed import. A failing evaluation (`is_valid: false`) is a normal
   * `ok: true` answer here; only a request Pulp or the route refused outright is `ok: false`.
   */
  async checkImport(
    payload: PulpImportCheckPayload
  ): Promise<ServiceDataResult<PulpImportCheckResult>> {
    const response = await fetch(`${IMPORTERS_PATH}/import-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }

    return { ok: true, data: (await response.json()) as PulpImportCheckResult };
  },
};
