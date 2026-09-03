import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import { normalizePulpHrefToApiPath } from "@/app/api/pulp/repositories/_server";
import { PulpObjectRole, PulpObjectRoleAssignmentPayload } from "@/services/pulp/types";

/** Resource kinds Pulp's list_roles/add_role/remove_role endpoints exist on (Epic E scope). */
const ALLOWED_OBJECT_ROLE_PATH_PREFIXES = [
  "/repositories/",
  "/remotes/",
  "/distributions/",
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

export async function GET(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const url = new URL(request.url);
  const pulpHref = url.searchParams.get("pulp_href")?.trim();
  if (!pulpHref) {
    return Response.json({ detail: "pulp_href is required." }, { status: 400 });
  }

  const apiPath = normalizePulpHrefToApiPath(pulpHref);
  if (!isAllowedObjectRoleApiPath(apiPath)) {
    return Response.json({ detail: "Not a role-assignable resource href." }, { status: 400 });
  }

  const result = await pulpFetch<{ roles: PulpObjectRole[] }>(`${apiPath}list_roles/`, authResult.auth);

  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: result.detail }, { status: result.status });
  }

  return Response.json(result.data);
}

export async function POST(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

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

  const result = await pulpFetch(`${apiPath}add_role/`, authResult.auth, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: result.detail }, { status: result.status });
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

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

  const result = await pulpFetch(`${apiPath}remove_role/`, authResult.auth, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: result.detail }, { status: result.status });
  }

  return Response.json({ ok: true });
}
