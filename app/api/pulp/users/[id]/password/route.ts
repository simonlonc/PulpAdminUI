import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../../../_helpers";

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

type ChangePasswordPayload = {
  password: string;
};

export const PATCH = withPulpAuth(
  async (request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    if (!id) {
      return Response.json({ detail: "User id is required." }, { status: 400 });
    }

    let payload: Partial<ChangePasswordPayload> | null = null;
    try {
      payload = (await request.json()) as Partial<ChangePasswordPayload>;
    } catch {
      return Response.json({ detail: "Invalid request body." }, { status: 400 });
    }

    if (typeof payload.password !== "string" || payload.password.length === 0) {
      return Response.json({ detail: "Password is required." }, { status: 400 });
    }

    const result = await pulpFetch<PulpUser>(`/users/${id}/`, auth, {
      method: "PATCH",
      body: JSON.stringify({ password: payload.password }),
    });

    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    return Response.json({ ok: true });
  }
);
