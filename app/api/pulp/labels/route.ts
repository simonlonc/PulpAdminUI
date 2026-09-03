import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
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

export async function POST(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

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

  const result = await pulpFetch(`${apiPath}set_label/`, authResult.auth, {
    method: "POST",
    body: JSON.stringify({ key, value: body.value ?? null }),
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

  const result = await pulpFetch(`${apiPath}unset_label/`, authResult.auth, {
    method: "POST",
    body: JSON.stringify({ key }),
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
