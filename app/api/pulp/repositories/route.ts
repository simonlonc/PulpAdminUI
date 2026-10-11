import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import type { PulpPaginatedResponse, PulpRepository } from "@/services/pulp/types";
import { buildUpstreamListParams } from "./_server";

/** Repositories of every plugin kind in one call (Pulp's generic /repositories/ list). The kind of
 * each row is only in its `pulp_href`, so callers map it back through the plugin registry. */
export const GET = withPulpAuth(async (request, auth) => {
  const url = new URL(request.url);
  const queryParams = buildUpstreamListParams(url.searchParams);

  const result = await pulpFetch<PulpPaginatedResponse<PulpRepository>>(
    `/repositories/?${queryParams.toString()}`,
    auth
  );
  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});
