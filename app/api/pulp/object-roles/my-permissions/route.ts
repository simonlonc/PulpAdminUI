import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import { normalizePulpHrefToApiPath } from "@/app/api/pulp/repositories/_server";

/** Resource kinds Pulp's my_permissions endpoint exists on (Epic E scope). */
const ALLOWED_OBJECT_ROLE_PATH_PREFIXES = [
  "/repositories/",
  "/remotes/",
  "/distributions/",
] as const;

/** Guards against proxying a request to an arbitrary upstream path. */
function isAllowedObjectRoleApiPath(apiPath: string): boolean {
  return apiPath.endsWith("/") && ALLOWED_OBJECT_ROLE_PATH_PREFIXES.some((prefix) => apiPath.startsWith(prefix));
}

export const GET = withPulpAuth(async (request, auth) => {
  const url = new URL(request.url);
  const pulpHref = url.searchParams.get("pulp_href")?.trim();
  if (!pulpHref) {
    return Response.json({ detail: "pulp_href is required." }, { status: 400 });
  }

  const apiPath = normalizePulpHrefToApiPath(pulpHref);
  if (!isAllowedObjectRoleApiPath(apiPath)) {
    return Response.json({ detail: "Not a role-assignable resource href." }, { status: 400 });
  }

  const result = await pulpFetch<{ permissions: string[] }>(`${apiPath}my_permissions/`, auth);

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});
