import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../../_helpers";

type PulpUser = {
  pulp_href: string;
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  is_staff: boolean;
  is_active: boolean;
  date_joined: string;
};

type UpdatePulpUserPayload = {
  username?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  is_staff?: boolean;
  is_active?: boolean;
};

export const PATCH = withPulpAuth(
  async (request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    if (!id) {
      return Response.json({ detail: "User id is required." }, { status: 400 });
    }

    let payload: Partial<UpdatePulpUserPayload> | null = null;
    try {
      payload = (await request.json()) as Partial<UpdatePulpUserPayload>;
    } catch {
      return Response.json({ detail: "Invalid request body." }, { status: 400 });
    }

    const updatePayload: UpdatePulpUserPayload = {};
    if (typeof payload.username === "string") updatePayload.username = payload.username.trim();
    if (typeof payload.first_name === "string") updatePayload.first_name = payload.first_name.trim();
    if (typeof payload.last_name === "string") updatePayload.last_name = payload.last_name.trim();
    if (typeof payload.email === "string") updatePayload.email = payload.email.trim();
    if (typeof payload.is_staff === "boolean") updatePayload.is_staff = payload.is_staff;
    if (typeof payload.is_active === "boolean") updatePayload.is_active = payload.is_active;

    if (Object.keys(updatePayload).length === 0) {
      return Response.json(
        { detail: "At least one user field must be provided." },
        { status: 400 }
      );
    }

    const result = await pulpFetch<PulpUser>(`/users/${id}/`, auth, {
      method: "PATCH",
      body: JSON.stringify(updatePayload),
    });

    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    return Response.json(result.data);
  }
);

export const DELETE = withPulpAuth(
  async (_request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    if (!id) {
      return Response.json({ detail: "User id is required." }, { status: 400 });
    }

    const result = await pulpFetch(`/users/${id}/`, auth, {
      method: "DELETE",
    });

    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    return Response.json({ ok: true });
  }
);
