import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, readJsonBody, readStringArrayField, withPulpAuth } from "@/app/api/pulp/_helpers";
import { buildUpstreamListParams, toPulpHrefPath } from "../../repositories/_server";
import type {
  CreatePulpExporterPayload,
  PulpExporter,
  PulpPaginatedResponse,
} from "@/services/pulp/types";

export const GET = withPulpAuth(async (request, auth) => {
  const url = new URL(request.url);
  const qs = buildUpstreamListParams(url.searchParams);
  // Exporters have no labels, and Pulp 400s on this filter for them.
  qs.delete("pulp_label_select");

  const result = await pulpFetch<PulpPaginatedResponse<PulpExporter>>(
    `/exporters/core/pulp/?${qs.toString()}`,
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

  const createPayload: CreatePulpExporterPayload = {
    name,
    path,
    repositories: readStringArrayField(body, "repositories").map((repository) =>
      toPulpHrefPath(repository, auth)
    ),
  };

  const result = await pulpFetch<PulpExporter>("/exporters/core/pulp/", auth, {
    method: "POST",
    body: JSON.stringify(createPayload),
  });

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});
