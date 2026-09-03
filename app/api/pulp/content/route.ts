import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { requirePulpAuth } from "../_helpers";
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

export async function GET(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const url = new URL(request.url);
  const qs = buildUpstreamListParams(url.searchParams, CONTENT_LIST_PARAMS);
  if (!url.searchParams.get("limit")) {
    qs.set("limit", "50");
  }

  const result = await pulpFetch<PulpPaginatedResponse<PulpContentItem>>(
    `/content/?${qs.toString()}`,
    authResult.auth
  );

  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }

    return Response.json({ detail: result.detail }, { status: result.status });
  }

  return Response.json(result.data);
}
