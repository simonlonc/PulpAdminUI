import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, readJsonBody, withPulpAuth } from "@/app/api/pulp/_helpers";
import type { PulpImportCheckResult } from "@/services/pulp/types";
import { readRepoMappingField } from "../_server";

/**
 * Pre-flight check of an import before committing to it. Pulp answers 200 with an evaluation of
 * each field it was sent; `is_valid: false` in one of them is a normal answer, not an error, so the
 * body goes back unchanged. Only a request with nothing to evaluate is refused (400).
 */
export const POST = withPulpAuth(async (request, auth) => {
  const body = await readJsonBody(request);

  // Only the fields that are present and of the right type are forwarded.
  const checkPayload: { path?: string; toc?: string; repo_mapping?: string } = {};
  if (typeof body.path === "string" && body.path.trim()) checkPayload.path = body.path.trim();
  if (typeof body.toc === "string" && body.toc.trim()) checkPayload.toc = body.toc.trim();
  // Unlike an importer's, import-check's repo_mapping is a JSON-encoded string upstream. The client
  // sends the same plain object it sends to create an importer, and it is encoded here. A mapping
  // with no pairs left is not forwarded: Pulp rejects an empty one.
  const repoMapping = readRepoMappingField(body);
  if (repoMapping !== undefined && Object.keys(repoMapping).length > 0) {
    checkPayload.repo_mapping = JSON.stringify(repoMapping);
  }

  if (Object.keys(checkPayload).length === 0) {
    return Response.json(
      { detail: "One of path, toc, or repo_mapping must be specified." },
      { status: 400 }
    );
  }

  const result = await pulpFetch<PulpImportCheckResult>("/importers/core/pulp/import-check/", auth, {
    method: "POST",
    body: JSON.stringify(checkPayload),
  });

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});
