import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { requirePulpAuth } from "../_helpers";
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

export async function GET(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const url = new URL(request.url);
  const qs = buildUpstreamListParams(url.searchParams, [
    "repository",
    "repository_version",
    "pulp_type",
  ]);

  const result = await pulpFetch<PulpListResponse<PulpPublication>>(
    `/publications/?${qs.toString()}`,
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
