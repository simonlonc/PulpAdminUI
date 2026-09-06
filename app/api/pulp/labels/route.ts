import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import { normalizePulpHrefToApiPath } from "@/app/api/pulp/repositories/_server";

/** Resource kinds Pulp's set_label/unset_label endpoints exist on. */
const ALLOWED_LABEL_PATH_PREFIXES = [
  "/repositories/",
  "/remotes/",
  "/distributions/",
  "/publications/",
  "/content/",
] as const;

type SetLabelBody = {
  pulp_href?: string;
  key?: string;
  value?: string | null;
};

type UnsetLabelBody = {
  pulp_href?: string;
  key?: string;
};

/** Guards against proxying a POST to an arbitrary upstream path. */
function isAllowedLabelApiPath(apiPath: string): boolean {
  return apiPath.endsWith("/") && ALLOWED_LABEL_PATH_PREFIXES.some((prefix) => apiPath.startsWith(prefix));
}

export const POST = withPulpAuth(async (request, auth) => {
  const body = (await request.json()) as SetLabelBody;
  const pulpHref = body.pulp_href?.trim();
  if (!pulpHref) {
    return Response.json({ detail: "pulp_href is required." }, { status: 400 });
  }
  const key = body.key?.trim();
  if (!key) {
    return Response.json({ detail: "key is required." }, { status: 400 });
  }

  const apiPath = normalizePulpHrefToApiPath(pulpHref);
  if (!isAllowedLabelApiPath(apiPath)) {
    return Response.json({ detail: "Not a labelable resource href." }, { status: 400 });
  }

  const result = await pulpFetch(`${apiPath}set_label/`, auth, {
    method: "POST",
    body: JSON.stringify({ key, value: body.value ?? null }),
  });

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json({ ok: true });
});

export const DELETE = withPulpAuth(async (request, auth) => {
  const body = (await request.json()) as UnsetLabelBody;
  const pulpHref = body.pulp_href?.trim();
  if (!pulpHref) {
    return Response.json({ detail: "pulp_href is required." }, { status: 400 });
  }
  const key = body.key?.trim();
  if (!key) {
    return Response.json({ detail: "key is required." }, { status: 400 });
  }

  const apiPath = normalizePulpHrefToApiPath(pulpHref);
  if (!isAllowedLabelApiPath(apiPath)) {
    return Response.json({ detail: "Not a labelable resource href." }, { status: 400 });
  }

  const result = await pulpFetch(`${apiPath}unset_label/`, auth, {
    method: "POST",
    body: JSON.stringify({ key }),
  });

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json({ ok: true });
});
