import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, readJsonBody, withPulpAuth } from "@/app/api/pulp/_helpers";
import { buildUpstreamListParams } from "../../repositories/_server";
import type {
  CreatePulpImporterPayload,
  PulpImporter,
  PulpPaginatedResponse,
} from "@/services/pulp/types";
import { readRepoMappingField } from "./_server";

export const GET = withPulpAuth(async (request, auth) => {
  const url = new URL(request.url);
  const qs = buildUpstreamListParams(url.searchParams);
  // Importers have no labels, and Pulp 400s on this filter for them.
  qs.delete("pulp_label_select");

  const result = await pulpFetch<PulpPaginatedResponse<PulpImporter>>(
    `/importers/core/pulp/?${qs.toString()}`,
    auth
  );
  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});

/** Importer create is synchronous (201 with the object, no task href). Pulp checks that every
 * repository named on the right of `repo_mapping` exists and answers a bare-list 400 if one does not. */
export const POST = withPulpAuth(async (request, auth) => {
  const body = await readJsonBody(request);

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return Response.json({ detail: "Importer name is required." }, { status: 400 });
  }

  const createPayload: CreatePulpImporterPayload = { name };
  const repoMapping = readRepoMappingField(body);
  if (repoMapping !== undefined) {
    createPayload.repo_mapping = repoMapping;
  }

  const result = await pulpFetch<PulpImporter>("/importers/core/pulp/", auth, {
    method: "POST",
    body: JSON.stringify(createPayload),
  });

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});
