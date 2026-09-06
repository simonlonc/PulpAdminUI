import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../_helpers";
import {
  CreatePulpRolePayload,
  PulpPaginatedResponse,
  PulpRole,
} from "@/services/pulp/types";

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
  const limit = parseLimit(url.searchParams.get("limit"));
  const offset = parseOffset(url.searchParams.get("offset"));
  const forObjectType = url.searchParams.get("for_object_type")?.trim();

  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (forObjectType) {
    qs.set("for_object_type", forObjectType);
  }

  const result = await pulpFetch<PulpPaginatedResponse<PulpRole>>(
    `/roles/?${qs.toString()}`,
    auth
  );

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});

function normalizePermissions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((s) => s.length > 0);
}

export const POST = withPulpAuth(async (request, auth) => {
  let payload: Partial<CreatePulpRolePayload> | null = null;
  try {
    payload = (await request.json()) as Partial<CreatePulpRolePayload>;
  } catch {
    return Response.json({ detail: "Invalid request body." }, { status: 400 });
  }

  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  const permissions = normalizePermissions(payload?.permissions);

  if (!name) {
    return Response.json({ detail: "Role name is required." }, { status: 400 });
  }

  if (permissions.length === 0) {
    return Response.json(
      { detail: "At least one permission is required." },
      { status: 400 }
    );
  }

  const description =
    typeof payload?.description === "string" ? payload.description.trim() : "";

  const createBody: Record<string, unknown> = {
    name,
    permissions,
  };
  if (description.length > 0) {
    createBody.description = description;
  }

  const result = await pulpFetch<PulpRole>("/roles/", auth, {
    method: "POST",
    body: JSON.stringify(createBody),
  });

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data, { status: 201 });
});
