import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../_helpers";
import { buildUpstreamListParams } from "../repositories/_server";

type PulpPublication = {
  pulp_href: string;
  pulp_created: string;
  repository_version: string;
  repository: string | null;
};

type PulpListResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export const GET = withPulpAuth(async (request, auth) => {
  const url = new URL(request.url);
  const qs = buildUpstreamListParams(url.searchParams, [
    "repository",
    "repository_version",
    "pulp_type",
  ]);

  const result = await pulpFetch<PulpListResponse<PulpPublication>>(
    `/publications/?${qs.toString()}`,
    auth
  );
  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});
