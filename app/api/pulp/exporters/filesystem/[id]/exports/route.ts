import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, readJsonBody, withPulpAuth } from "@/app/api/pulp/_helpers";
import { buildUpstreamListParams, toPulpHrefPath } from "@/app/api/pulp/repositories/_server";
import type {
  PulpFilesystemExport,
  PulpPaginatedResponse,
  RunPulpFilesystemExportPayload,
} from "@/services/pulp/types";
import { resolveFilesystemExporterPath } from "../../_server";

export const GET = withPulpAuth(
  async (request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const exporterPath = resolveFilesystemExporterPath(id);
    if (!exporterPath) {
      return Response.json({ detail: "Invalid exporter identifier." }, { status: 400 });
    }

    // Pulp's export list only accepts limit/offset, so the rest of the list allowlist is dropped.
    const listParams = buildUpstreamListParams(new URL(request.url).searchParams);
    const qs = new URLSearchParams({
      limit: listParams.get("limit") ?? "",
      offset: listParams.get("offset") ?? "",
    });

    const result = await pulpFetch<PulpPaginatedResponse<PulpFilesystemExport>>(
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
    const exporterPath = resolveFilesystemExporterPath(id);
    if (!exporterPath) {
      return Response.json({ detail: "Invalid exporter identifier." }, { status: 400 });
    }

    const body = await readJsonBody(request);

    // Only the fields present and of the right type are forwarded.
    const exportPayload: RunPulpFilesystemExportPayload = {};
    if (typeof body.publication === "string" && body.publication.trim()) {
      exportPayload.publication = toPulpHrefPath(body.publication.trim(), auth);
    }
    if (typeof body.repository_version === "string" && body.repository_version.trim()) {
      exportPayload.repository_version = toPulpHrefPath(body.repository_version.trim(), auth);
    }
    if (typeof body.start_repository_version === "string" && body.start_repository_version.trim()) {
      exportPayload.start_repository_version = toPulpHrefPath(body.start_repository_version.trim(), auth);
    }

    // Both or neither: Pulp answers that with a 400 of its own ("publication or repository_version
    // must either be supplied but not both."), so this only saves the round trip.
    if (Boolean(exportPayload.publication) === Boolean(exportPayload.repository_version)) {
      return Response.json(
        { detail: "Exactly one of publication or repository_version is required." },
        { status: 400 }
      );
    }

    const exportResult = await pulpFetch<{ task: string }>(`${exporterPath}exports/`, auth, {
      method: "POST",
      body: JSON.stringify(exportPayload),
    });

    if (!exportResult.ok) {
      throw new PulpApiError(exportResult.status, exportResult.detail);
    }

    const { task } = exportResult.data;

    // Dispatch-and-return: an export of a large publication outlives an HTTP request, so the task
    // href goes back to the UI to poll (or to link to on /tasks/detail) instead.
    return Response.json({ task });
  }
);
