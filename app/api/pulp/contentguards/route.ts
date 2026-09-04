import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { requirePulpAuth } from "../_helpers";
import { buildUpstreamListParams } from "../repositories/_server";

/** Row from GET /contentguards/, the generic cross-type content-guard list. Read-only proxy
 * for the distribution edit/create modals' guard picker; Epic I adds guard CRUD. */
type PulpContentGuard = {
  pulp_href: string;
  name: string;
  description: string | null;
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
  const qs = buildUpstreamListParams(url.searchParams, ["pulp_type"]);

  const result = await pulpFetch<PulpListResponse<PulpContentGuard>>(
    `/contentguards/?${qs.toString()}`,
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
