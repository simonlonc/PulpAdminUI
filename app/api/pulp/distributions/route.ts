import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { requirePulpAuth } from "../_helpers";
import { buildUpstreamListParams } from "../repositories/_server";

type PulpDistribution = {
  pulp_href: string;
  pulp_created: string;
  base_path: string;
  base_url: string;
  content_guard: string | null;
  pulp_labels: Record<string, string>;
  name: string;
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
  const qs = buildUpstreamListParams(url.searchParams, ["repository"]);

  const result = await pulpFetch<PulpListResponse<PulpDistribution>>(
    `/distributions/?${qs.toString()}`,
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
