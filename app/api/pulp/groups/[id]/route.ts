import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../../_helpers";

type PulpGroup = {
  pulp_href: string;
  id: number;
  name: string;
};

type UpdatePulpGroupPayload = {
  name?: string;
};

export const PATCH = withPulpAuth(
  async (request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    if (!id) {
      return Response.json({ detail: "Group id is required." }, { status: 400 });
    }

    let payload: Partial<UpdatePulpGroupPayload> | null = null;
    try {
      payload = (await request.json()) as Partial<UpdatePulpGroupPayload>;
    } catch {
      return Response.json({ detail: "Invalid request body." }, { status: 400 });
    }

    const updatePayload: UpdatePulpGroupPayload = {};
    if (typeof payload.name === "string") updatePayload.name = payload.name.trim();

    if (!updatePayload.name) {
      return Response.json({ detail: "Group name is required." }, { status: 400 });
    }

    const result = await pulpFetch<PulpGroup>(`/groups/${id}/`, auth, {
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
      return Response.json({ detail: "Group id is required." }, { status: 400 });
    }

    const result = await pulpFetch(`/groups/${id}/`, auth, {
      method: "DELETE",
    });

    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    return Response.json({ ok: true });
  }
);
