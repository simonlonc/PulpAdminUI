import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
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

export async function GET(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

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
