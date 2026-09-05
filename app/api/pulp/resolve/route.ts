import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { requirePulpAuth } from "../_helpers";
import { normalizePulpHrefToApiPath } from "../repositories/_server";
import { parsePulpResourceRef, pulpListPathForPrn } from "@/lib/pulp-resource-ref";

type PulpResolvedObject = {
  pulp_href?: string;
  prn?: string;
  name?: string | null;
};

type PulpListResponse<T> = {
  count: number;
  results: T[];
};

function resolvedResourceResponse(object: PulpResolvedObject) {
  if (!object.pulp_href || !object.prn) {
    return Response.json({ detail: "Resource has no pulp_href or prn." }, { status: 502 });
  }

  return Response.json({
    pulp_href: object.pulp_href,
    prn: object.prn,
    name: typeof object.name === "string" ? object.name : null,
  });
}

export async function GET(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const url = new URL(request.url);
  const ref = url.searchParams.get("ref")?.trim();
  if (!ref) {
    return Response.json({ detail: "ref is required." }, { status: 400 });
  }

  const parsed = parsePulpResourceRef(ref);
  if (!parsed) {
    return Response.json({ detail: "Not a valid pulp_href or PRN." }, { status: 400 });
  }

  if (parsed.kind === "href") {
    const apiPath = normalizePulpHrefToApiPath(parsed.href);
    const result = await pulpFetch<PulpResolvedObject>(apiPath, authResult.auth);
    if (!result.ok) {
      if (result.status === 401 || result.status === 403) {
        const cookieStore = await cookies();
        cookieStore.delete(PULP_AUTH_COOKIE);
      }

      return Response.json({ detail: result.detail }, { status: result.status });
    }

    return resolvedResourceResponse(result.data);
  }

  const listPath = pulpListPathForPrn(parsed.prn);
  if (!listPath) {
    return Response.json({ detail: "Not a valid PRN." }, { status: 400 });
  }

  const qs = new URLSearchParams({ prn__in: parsed.prn, limit: "1" });
  const result = await pulpFetch<PulpListResponse<PulpResolvedObject>>(
    `${listPath}?${qs.toString()}`,
    authResult.auth
  );
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }

    return Response.json({ detail: result.detail }, { status: result.status });
  }

  const match = result.data.results[0];
  if (!match) {
    return Response.json({ detail: "No resource matches this PRN." }, { status: 404 });
  }

  return resolvedResourceResponse(match);
}
