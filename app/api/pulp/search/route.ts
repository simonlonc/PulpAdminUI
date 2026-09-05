import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { requirePulpAuth } from "../_helpers";
import { PulpResourceFamily } from "@/lib/pulp-resource-ref";

/**
 * Cross-family name search (Epic J2). Pulp has no unified search endpoint, so this fans out
 * name__icontains queries to the generic list endpoints that support it. /publications/ and
 * /content/ have no name field, and /tasks/ only filters dotted Python task paths, so those three
 * are out of scope -- app/search/page.tsx says so in the UI.
 */

type PulpSearchResultObject = {
  pulp_href: string;
  prn: string;
  name: string;
};

type PulpListResponse<T> = {
  count: number;
  results: T[];
};

const SEARCH_FAMILIES: { family: PulpResourceFamily; path: string }[] = [
  { family: "repository", path: "/repositories/" },
  { family: "remote", path: "/remotes/" },
  { family: "distribution", path: "/distributions/" },
  { family: "contentGuard", path: "/contentguards/" },
];

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const url = new URL(request.url);
  const term = url.searchParams.get("search")?.trim();
  if (!term) {
    return Response.json({ detail: "search is required." }, { status: 400 });
  }

  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;
  const qs = new URLSearchParams({ name__icontains: term, limit: String(limit), offset: "0" });

  const settled = await Promise.allSettled(
    SEARCH_FAMILIES.map(({ path }) =>
      pulpFetch<PulpListResponse<PulpSearchResultObject>>(`${path}?${qs.toString()}`, authResult.auth)
    )
  );

  for (const outcome of settled) {
    if (outcome.status !== "fulfilled") {
      continue;
    }
    const result = outcome.value;
    if (!result.ok && (result.status === 401 || result.status === 403)) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
      return Response.json({ detail: result.detail }, { status: result.status });
    }
  }

  const groups = SEARCH_FAMILIES.map(({ family }, index) => {
    const outcome = settled[index];
    if (outcome.status === "rejected") {
      const reason = outcome.reason;
      return {
        family,
        count: 0,
        results: [],
        error: reason instanceof Error ? reason.message : "Request failed.",
      };
    }

    const result = outcome.value;
    if (!result.ok) {
      return { family, count: 0, results: [], error: result.detail };
    }

    return {
      family,
      count: result.data.count,
      results: result.data.results.map((object) => ({
        pulp_href: object.pulp_href,
        prn: object.prn,
        name: object.name,
      })),
      error: null,
    };
  });

  return Response.json({ groups });
}
