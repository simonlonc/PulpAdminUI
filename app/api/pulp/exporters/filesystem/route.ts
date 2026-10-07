import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, readJsonBody, withPulpAuth } from "@/app/api/pulp/_helpers";
import { buildUpstreamListParams } from "../../repositories/_server";
import { isPulpFilesystemExportMethod } from "@/services/pulp/filesystem-export-methods";
import type {
  CreatePulpFilesystemExporterPayload,
  PulpFilesystemExporter,
  PulpPaginatedResponse,
} from "@/services/pulp/types";

export const GET = withPulpAuth(async (request, auth) => {
  const url = new URL(request.url);
  const qs = buildUpstreamListParams(url.searchParams);
  // Exporters have no labels, and Pulp 400s on this filter for them.
  qs.delete("pulp_label_select");

  const result = await pulpFetch<PulpPaginatedResponse<PulpFilesystemExporter>>(
    `/exporters/core/filesystem/?${qs.toString()}`,
    auth
  );
  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});

/** Exporter create is synchronous (201 with the object, no task href). Pulp checks `path`
 * against its ALLOWED_EXPORT_PATHS setting and answers a 400 naming the field if it is not listed. */
export const POST = withPulpAuth(async (request, auth) => {
  const body = await readJsonBody(request);

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return Response.json({ detail: "Exporter name is required." }, { status: 400 });
  }

  const path = typeof body.path === "string" ? body.path.trim() : "";
  if (!path) {
    return Response.json({ detail: "Exporter path is required." }, { status: 400 });
  }

  const createPayload: CreatePulpFilesystemExporterPayload = { name, path };
  // Left out when absent so Pulp applies its own default (write).
  if ("method" in body) {
    if (!isPulpFilesystemExportMethod(body.method)) {
      return Response.json(
        { detail: "method must be one of write, hardlink or symlink." },
        { status: 400 }
      );
    }
    createPayload.method = body.method;
  }

  const result = await pulpFetch<PulpFilesystemExporter>("/exporters/core/filesystem/", auth, {
    method: "POST",
    body: JSON.stringify(createPayload),
  });

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});
