import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { requirePulpAuth } from "../../_helpers";

type PulpContentGuardDetail = {
  pulp_href: string;
  prn: string;
  pulp_created: string;
  pulp_last_updated: string;
  name: string;
  description: string | null;
  header_name?: string;
  header_value?: string;
  jq_filter?: string | null;
  ca_certificate?: string;
  guards?: string[];
  users?: { username: string; pulp_href: string; prn: string }[];
  groups?: { name: string; pulp_href: string; prn: string }[];
};

type UpdatePulpContentGuardPayload = {
  name?: string;
  description?: string | null;
  header_name?: string;
  header_value?: string;
  jq_filter?: string | null;
  ca_certificate?: string;
  guards?: string[];
};

function resolveContentGuardPath(encodedRef: string): string | null {
  const decodedRef = decodeURIComponent(encodedRef).trim();
  if (decodedRef.length === 0) {
    return null;
  }

  let pathname = decodedRef;
  if (/^https?:\/\//i.test(decodedRef)) {
    try {
      pathname = new URL(decodedRef).pathname;
    } catch {
      return null;
    }
  }

  if (!pathname.startsWith("/")) {
    return null;
  }

  const contentGuardsIndex = pathname.indexOf("/contentguards/");
  if (contentGuardsIndex === -1) {
    return null;
  }

  const normalizedPath = pathname.slice(contentGuardsIndex);
  return normalizedPath.endsWith("/") ? normalizedPath : `${normalizedPath}/`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { id } = await params;
  const contentGuardPath = resolveContentGuardPath(id);
  if (!contentGuardPath) {
    return Response.json({ detail: "Invalid content guard identifier." }, { status: 400 });
  }

  const result = await pulpFetch<PulpContentGuardDetail>(contentGuardPath, authResult.auth);

  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }

    return Response.json({ detail: result.detail }, { status: result.status });
  }

  return Response.json(result.data);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { id } = await params;
  const contentGuardPath = resolveContentGuardPath(id);
  if (!contentGuardPath) {
    return Response.json({ detail: "Invalid content guard identifier." }, { status: 400 });
  }

  let payload: Partial<UpdatePulpContentGuardPayload> | null = null;
  try {
    payload = (await request.json()) as Partial<UpdatePulpContentGuardPayload>;
  } catch {
    return Response.json({ detail: "Invalid request body." }, { status: 400 });
  }

  const updatePayload: UpdatePulpContentGuardPayload = {};
  if (typeof payload.name === "string") updatePayload.name = payload.name.trim();
  if ("description" in (payload ?? {})) {
    updatePayload.description = payload.description ?? null;
  }
  if (typeof payload.header_name === "string") updatePayload.header_name = payload.header_name.trim();
  if (typeof payload.header_value === "string") updatePayload.header_value = payload.header_value;
  if ("jq_filter" in (payload ?? {})) {
    updatePayload.jq_filter = payload.jq_filter ?? null;
  }
  if (typeof payload.ca_certificate === "string") updatePayload.ca_certificate = payload.ca_certificate;
  if ("guards" in (payload ?? {})) {
    updatePayload.guards = payload.guards ?? [];
  }

  if (Object.keys(updatePayload).length === 0) {
    return Response.json(
      { detail: "At least one content guard field must be provided." },
      { status: 400 }
    );
  }

  const result = await pulpFetch<PulpContentGuardDetail>(contentGuardPath, authResult.auth, {
    method: "PATCH",
    body: JSON.stringify(updatePayload),
  });

  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }

    return Response.json({ detail: result.detail }, { status: result.status });
  }

  return Response.json(result.data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { id } = await params;
  const contentGuardPath = resolveContentGuardPath(id);
  if (!contentGuardPath) {
    return Response.json({ detail: "Invalid content guard identifier." }, { status: 400 });
  }

  const result = await pulpFetch(contentGuardPath, authResult.auth, {
    method: "DELETE",
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
