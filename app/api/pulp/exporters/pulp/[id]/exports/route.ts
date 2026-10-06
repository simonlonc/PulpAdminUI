import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, readJsonBody, readStringArrayField, withPulpAuth } from "@/app/api/pulp/_helpers";
import { buildUpstreamListParams, toPulpHrefPath } from "@/app/api/pulp/repositories/_server";
import type { PulpExport, PulpPaginatedResponse, RunPulpExportPayload } from "@/services/pulp/types";
import { resolvePulpExporterPath } from "../../_server";

export const GET = withPulpAuth(
  async (request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const exporterPath = resolvePulpExporterPath(id);
    if (!exporterPath) {
      return Response.json({ detail: "Invalid exporter identifier." }, { status: 400 });
    }

    // Pulp's export list only accepts limit/offset, so the rest of the list allowlist is dropped.
    const listParams = buildUpstreamListParams(new URL(request.url).searchParams);
    const qs = new URLSearchParams({
      limit: listParams.get("limit") ?? "",
      offset: listParams.get("offset") ?? "",
    });

    const result = await pulpFetch<PulpPaginatedResponse<PulpExport>>(
      `${exporterPath}exports/?${qs.toString()}`,
      auth
    );
    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    return Response.json(result.data);
  }
);

export const POST = withPulpAuth(
  async (request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const exporterPath = resolvePulpExporterPath(id);
    if (!exporterPath) {
      return Response.json({ detail: "Invalid exporter identifier." }, { status: 400 });
    }

    const body = await readJsonBody(request);

    // Every field is optional; only the ones present and of the right type are forwarded.
    const exportPayload: RunPulpExportPayload = {};
    if (typeof body.full === "boolean") exportPayload.full = body.full;
    if (typeof body.dry_run === "boolean") exportPayload.dry_run = body.dry_run;
    if (typeof body.chunk_size === "string" && body.chunk_size.trim()) {
      exportPayload.chunk_size = body.chunk_size.trim();
    }
    // An empty list is left out: Pulp answers it with a 400 about the version count not matching
    // the exporter's repositories, where leaving the field out means "the current versions".
    const versions = readStringArrayField(body, "versions");
    if (versions.length > 0) {
      exportPayload.versions = versions.map((version) => toPulpHrefPath(version));
    }
    const startVersions = readStringArrayField(body, "start_versions");
    if (startVersions.length > 0) {
      exportPayload.start_versions = startVersions.map((version) => toPulpHrefPath(version));
    }
    if (typeof body.meta === "object" && body.meta !== null && !Array.isArray(body.meta)) {
      exportPayload.meta = body.meta as Record<string, unknown>;
    }

    const exportResult = await pulpFetch<{ task: string }>(`${exporterPath}exports/`, auth, {
      method: "POST",
      body: JSON.stringify(exportPayload),
    });

    if (!exportResult.ok) {
      throw new PulpApiError(exportResult.status, exportResult.detail);
    }

    const { task } = exportResult.data;

    // Dispatch-and-return: an export of a large repository outlives an HTTP request, so the task
    // href goes back to the UI to poll (or to link to on /tasks/detail) instead.
    return Response.json({ task });
  }
);
