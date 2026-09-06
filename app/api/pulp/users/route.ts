import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../_helpers";

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

type PulpListResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

type CreatePulpUserPayload = {
  username: string;
  password: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  is_staff?: boolean;
  is_active?: boolean;
};

export const GET = withPulpAuth(async (_request, auth) => {
  const result = await pulpFetch<PulpListResponse<PulpUser>>("/users/", auth);
  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});

export const POST = withPulpAuth(async (request, auth) => {
  let payload: Partial<CreatePulpUserPayload> | null = null;
  try {
    payload = (await request.json()) as Partial<CreatePulpUserPayload>;
  } catch {
    return Response.json({ detail: "Invalid request body." }, { status: 400 });
  }

  if (!payload?.username?.trim() || !payload?.password) {
    return Response.json(
      { detail: "Both username and password are required." },
      { status: 400 }
    );
  }

  const createPayload: CreatePulpUserPayload = {
    username: payload.username.trim(),
    password: payload.password,
    first_name: payload.first_name?.trim() || "",
    last_name: payload.last_name?.trim() || "",
    email: payload.email?.trim() || "",
    is_staff: Boolean(payload.is_staff),
    is_active: payload.is_active ?? true,
  };

  const result = await pulpFetch<PulpUser>("/users/", auth, {
    method: "POST",
    body: JSON.stringify(createPayload),
  });

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data, { status: 201 });
});
