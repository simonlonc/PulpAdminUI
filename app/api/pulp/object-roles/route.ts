import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import { normalizePulpHrefToApiPath } from "@/app/api/pulp/repositories/_server";
import { PulpObjectRole, PulpObjectRoleAssignmentPayload } from "@/services/pulp/types";

/** Resource kinds Pulp's list_roles/add_role/remove_role endpoints exist on. */
const ALLOWED_OBJECT_ROLE_PATH_PREFIXES = [
  "/repositories/",
  "/remotes/",
  "/distributions/",
  "/contentguards/",
] as const;

type ObjectRoleAssignmentBody = {
  pulp_href?: string;
  role?: string;
  users?: string[];
  groups?: string[];
};

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

  const result = await pulpFetch<{ roles: PulpObjectRole[] }>(`${apiPath}list_roles/`, auth);

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});

export const POST = withPulpAuth(async (request, auth) => {
  const body = (await request.json()) as ObjectRoleAssignmentBody;
  const pulpHref = body.pulp_href?.trim();
  if (!pulpHref) {
    return Response.json({ detail: "pulp_href is required." }, { status: 400 });
  }
  const role = body.role?.trim();
  if (!role) {
    return Response.json({ detail: "role is required." }, { status: 400 });
  }

  const apiPath = normalizePulpHrefToApiPath(pulpHref);
  if (!isAllowedObjectRoleApiPath(apiPath)) {
    return Response.json({ detail: "Not a role-assignable resource href." }, { status: 400 });
  }

  const payload: PulpObjectRoleAssignmentPayload = { role, users: body.users ?? [], groups: body.groups ?? [] };

  const result = await pulpFetch(`${apiPath}add_role/`, auth, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json({ ok: true });
});

export const DELETE = withPulpAuth(async (request, auth) => {
  const body = (await request.json()) as ObjectRoleAssignmentBody;
  const pulpHref = body.pulp_href?.trim();
  if (!pulpHref) {
    return Response.json({ detail: "pulp_href is required." }, { status: 400 });
  }
  const role = body.role?.trim();
  if (!role) {
    return Response.json({ detail: "role is required." }, { status: 400 });
  }

  const apiPath = normalizePulpHrefToApiPath(pulpHref);
  if (!isAllowedObjectRoleApiPath(apiPath)) {
    return Response.json({ detail: "Not a role-assignable resource href." }, { status: 400 });
  }

  const payload: PulpObjectRoleAssignmentPayload = { role, users: body.users ?? [], groups: body.groups ?? [] };

  const result = await pulpFetch(`${apiPath}remove_role/`, auth, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json({ ok: true });
});
