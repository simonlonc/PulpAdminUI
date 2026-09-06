import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../../_helpers";
import {
  PutPulpRolePayload,
  PulpRole,
  UpdatePulpRolePayload,
} from "@/services/pulp/types";

const ROLE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidRoleId(id: string): boolean {
  return ROLE_ID_RE.test(id.trim());
}

function normalizePermissions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((s) => s.length > 0);
}

function roleDetailPath(id: string): string {
  return `/roles/${id.trim()}/`;
}

export const PATCH = withPulpAuth(
  async (request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id: rawId } = await params;
    const id = rawId?.trim() ?? "";
    if (!id || !isValidRoleId(id)) {
      return Response.json({ detail: "Invalid role id." }, { status: 400 });
    }

    let payload: Partial<UpdatePulpRolePayload> | null = null;
    try {
      payload = (await request.json()) as Partial<UpdatePulpRolePayload>;
    } catch {
      return Response.json({ detail: "Invalid request body." }, { status: 400 });
    }

    const updateBody: Record<string, unknown> = {};

    if (typeof payload?.name === "string") {
      const name = payload.name.trim();
      if (!name) {
        return Response.json({ detail: "Role name cannot be empty." }, { status: 400 });
      }
      updateBody.name = name;
    }

    if ("description" in (payload ?? {})) {
      if (payload?.description === null) {
        updateBody.description = null;
      } else if (typeof payload?.description === "string") {
        const d = payload.description.trim();
        updateBody.description = d.length > 0 ? d : null;
      }
    }

    if (payload?.permissions !== undefined) {
      const permissions = normalizePermissions(payload.permissions);
      if (permissions.length === 0) {
        return Response.json(
          { detail: "At least one permission is required when updating permissions." },
          { status: 400 }
        );
      }
      updateBody.permissions = permissions;
    }

    if (Object.keys(updateBody).length === 0) {
      return Response.json(
        { detail: "At least one field must be provided (name, description, or permissions)." },
        { status: 400 }
      );
    }

    const result = await pulpFetch<PulpRole>(roleDetailPath(id), auth, {
      method: "PATCH",
      body: JSON.stringify(updateBody),
    });

    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    return Response.json(result.data);
  }
);

export const PUT = withPulpAuth(
  async (request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id: rawId } = await params;
    const id = rawId?.trim() ?? "";
    if (!id || !isValidRoleId(id)) {
      return Response.json({ detail: "Invalid role id." }, { status: 400 });
    }

    let payload: Partial<PutPulpRolePayload> | null = null;
    try {
      payload = (await request.json()) as Partial<PutPulpRolePayload>;
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

    const putBody: PutPulpRolePayload = { name, permissions };

    if (payload?.description === null) {
      putBody.description = null;
    } else if (typeof payload?.description === "string") {
      const d = payload.description.trim();
      putBody.description = d.length > 0 ? d : null;
    }

    const result = await pulpFetch<PulpRole>(roleDetailPath(id), auth, {
      method: "PUT",
      body: JSON.stringify(putBody),
    });

    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    return Response.json(result.data);
  }
);

export const DELETE = withPulpAuth(
  async (_request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id: rawId } = await params;
    const id = rawId?.trim() ?? "";
    if (!id || !isValidRoleId(id)) {
      return Response.json({ detail: "Invalid role id." }, { status: 400 });
    }

    const result = await pulpFetch(roleDetailPath(id), auth, {
      method: "DELETE",
    });

    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    return Response.json({ ok: true });
  }
);
