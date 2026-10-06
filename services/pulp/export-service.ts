import { readApiDetail } from "./http";
import { settleDispatchedTask } from "./task-service";
import {
  CreatePulpExporterPayload,
  PulpExport,
  PulpExporter,
  PulpPaginatedResponse,
  RunPulpExportPayload,
  RunPulpExportResult,
  ServiceDataResult,
  ServiceResult,
  UpdatePulpExporterPayload,
} from "./types";

const EXPORTERS_PATH = "/api/pulp/exporters/pulp";

/** An export href is `{exporter_href}exports/{id}/`; capture group 1 is the exporter href. */
const EXPORT_HREF_PATTERN = /^(.*\/)exports\/[^/]+\/?$/;

/** What the update and delete routes return before the browser has polled the dispatched task. */
type ExporterTaskResponse = { task: string | null };

function encodeExporterRef(pulpHref: string): string | null {
  const normalized = pulpHref.trim();
  if (normalized.length === 0) {
    return null;
  }

  return encodeURIComponent(normalized);
}

export const pulpExportService = {
  async list(params?: URLSearchParams): Promise<PulpPaginatedResponse<PulpExporter>> {
    const qs = params?.toString();
    const response = await fetch(`${EXPORTERS_PATH}${qs ? `?${qs}` : ""}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpPaginatedResponse<PulpExporter>;
  },

  async get(pulpHref: string): Promise<PulpExporter> {
    const encodedRef = encodeExporterRef(pulpHref);
    if (!encodedRef) {
      throw new Error("Invalid exporter identifier.");
    }

    const response = await fetch(`${EXPORTERS_PATH}/${encodedRef}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpExporter;
  },

  async create(payload: CreatePulpExporterPayload): Promise<ServiceDataResult<PulpExporter>> {
    const response = await fetch(EXPORTERS_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }
    return { ok: true, data: (await response.json()) as PulpExporter };
  },

  async update(pulpHref: string, payload: UpdatePulpExporterPayload): Promise<ServiceResult> {
    const encodedRef = encodeExporterRef(pulpHref);
    if (!encodedRef) {
      return { ok: false, detail: "Invalid exporter identifier." };
    }

    const response = await fetch(`${EXPORTERS_PATH}/${encodedRef}`, {
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

    const data = (await response.json()) as ExporterTaskResponse;
    const settled = await settleDispatchedTask(data.task);
    if (!settled.ok) {
      return { ok: false, detail: settled.detail };
    }

    return { ok: true };
  },

  async remove(pulpHref: string): Promise<ServiceResult> {
    const encodedRef = encodeExporterRef(pulpHref);
    if (!encodedRef) {
      return { ok: false, detail: "Invalid exporter identifier." };
    }

    const response = await fetch(`${EXPORTERS_PATH}/${encodedRef}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      return {
        ok: false,
        detail: await readApiDetail(response),
      };
    }

    const data = (await response.json()) as ExporterTaskResponse;
    const settled = await settleDispatchedTask(data.task);
    if (!settled.ok) {
      return { ok: false, detail: settled.detail };
    }

    return { ok: true };
  },

  /** The export history of one exporter: GET {exporter_href}exports/. */
  async listExports(
    exporterHref: string,
    params?: URLSearchParams
  ): Promise<PulpPaginatedResponse<PulpExport>> {
    const encodedRef = encodeExporterRef(exporterHref);
    if (!encodedRef) {
      throw new Error("Invalid exporter identifier.");
    }

    const qs = params?.toString();
    const response = await fetch(`${EXPORTERS_PATH}/${encodedRef}/exports${qs ? `?${qs}` : ""}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpPaginatedResponse<PulpExport>;
  },

  /**
   * Dispatches an export and returns its task href WITHOUT waiting for it: an export can run for
   * a long time, so the UI links to /tasks/detail?pulp_href=... instead of blocking on it.
   */
  async runExport(
    exporterHref: string,
    payload: RunPulpExportPayload
  ): Promise<ServiceDataResult<RunPulpExportResult>> {
    const encodedRef = encodeExporterRef(exporterHref);
    if (!encodedRef) {
      return { ok: false, detail: "Invalid exporter identifier." };
    }

    const response = await fetch(`${EXPORTERS_PATH}/${encodedRef}/exports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }

    return { ok: true, data: (await response.json()) as RunPulpExportResult };
  },

  async removeExport(exportHref: string): Promise<ServiceResult> {
    const normalized = exportHref.trim();
    const match = normalized.match(EXPORT_HREF_PATTERN);
    if (!match) {
      return { ok: false, detail: "Invalid export identifier." };
    }

    const response = await fetch(
      `${EXPORTERS_PATH}/${encodeURIComponent(match[1])}/exports/${encodeURIComponent(normalized)}`,
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
};
