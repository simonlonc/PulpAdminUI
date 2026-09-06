import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../_helpers";
import { buildUpstreamListParams } from "../repositories/_server";

type PulpContentItem = {
  pulp_href: string;
  pulp_created: string;
  artifacts: Record<string, string>;
};

type PulpPaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

/**
 * GET /content/ has no name filter of any kind; only pulp_type and
 * repository_version narrow results. There is no `repository` param -- the
 * UI passes a repository's latest_version_href as repository_version instead.
 */
const CONTENT_LIST_PARAMS = ["pulp_type", "repository_version"] as const;

export const GET = withPulpAuth(async (request, auth) => {
  const url = new URL(request.url);
  const qs = buildUpstreamListParams(url.searchParams, CONTENT_LIST_PARAMS);
  if (!url.searchParams.get("limit")) {
    qs.set("limit", "50");
  }

  const result = await pulpFetch<PulpPaginatedResponse<PulpContentItem>>(
    `/content/?${qs.toString()}`,
    auth
  );

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});
