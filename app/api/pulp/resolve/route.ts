import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../_helpers";
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

export const GET = withPulpAuth(async (request, auth) => {
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
    const result = await pulpFetch<PulpResolvedObject>(apiPath, auth);
    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
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
    auth
  );
  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  const match = result.data.results[0];
  if (!match) {
    return Response.json({ detail: "No resource matches this PRN." }, { status: 404 });
  }

  return resolvedResourceResponse(match);
});
