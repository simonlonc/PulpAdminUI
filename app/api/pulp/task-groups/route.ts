import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import { normalizePulpHrefToApiPath, PulpPaginatedJson } from "../repositories/_server";
import { PulpTaskGroup } from "@/services/pulp/types";

function parseOffset(value: string | null): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return n;
}

function parseLimit(value: string | null): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < 1) {
    return 100;
  }
  return Math.min(500, n);
}

export const GET = withPulpAuth(async (request, auth) => {
  const url = new URL(request.url);
  const pulpHref = url.searchParams.get("pulp_href")?.trim();

  // A pulp_href selects one group with its member tasks; otherwise the list is returned.
  let path: string;
  if (pulpHref) {
    const apiPath = normalizePulpHrefToApiPath(pulpHref);
    if (!apiPath.includes("/task-groups/")) {
      return Response.json({ detail: "Not a task group href." }, { status: 400 });
    }
    path = apiPath;
  } else {
    const qs = new URLSearchParams({
      limit: String(parseLimit(url.searchParams.get("limit"))),
      offset: String(parseOffset(url.searchParams.get("offset"))),
    });
    path = `/task-groups/?${qs.toString()}`;
  }

  const result = await pulpFetch<PulpTaskGroup | PulpPaginatedJson<PulpTaskGroup>>(
    path,
    auth
  );

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});
