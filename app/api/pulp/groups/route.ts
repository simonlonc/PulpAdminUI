import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../_helpers";

type PulpGroup = {
  pulp_href: string;
  id: number;
  name: string;
};

type PulpListResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

type CreatePulpGroupPayload = {
  name: string;
};

export const GET = withPulpAuth(async (_request, auth) => {
  const result = await pulpFetch<PulpListResponse<PulpGroup>>("/groups/", auth);
  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});

export const POST = withPulpAuth(async (request, auth) => {
  let payload: Partial<CreatePulpGroupPayload> | null = null;
  try {
    payload = (await request.json()) as Partial<CreatePulpGroupPayload>;
  } catch {
    return Response.json({ detail: "Invalid request body." }, { status: 400 });
  }

  if (!payload?.name?.trim()) {
    return Response.json({ detail: "Group name is required." }, { status: 400 });
  }

  const createPayload: CreatePulpGroupPayload = {
    name: payload.name.trim(),
  };

  const result = await pulpFetch<PulpGroup>("/groups/", auth, {
    method: "POST",
    body: JSON.stringify(createPayload),
  });

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data, { status: 201 });
});
