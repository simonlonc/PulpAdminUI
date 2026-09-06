import { cookies } from "next/headers";
import {
  decodePulpAuth,
  encodePulpAuth,
  PULP_AUTH_COOKIE,
  PulpAuth,
  pulpFetch,
} from "@/lib/pulp";

type PulpUserCountResponse = { count: number };

export async function POST(request: Request) {
  let payload: Partial<PulpAuth> | null = null;

  try {
    payload = (await request.json()) as Partial<PulpAuth>;
  } catch {
    return Response.json({ detail: "Invalid request body." }, { status: 400 });
  }

  if (!payload?.username || !payload?.password) {
    return Response.json(
      { detail: "Both username and password are required." },
      { status: 400 }
    );
  }

  const auth: PulpAuth = {
    username: payload.username.trim(),
    password: payload.password,
  };

  const result = await pulpFetch<PulpUserCountResponse>(
    `/users/?username=${encodeURIComponent(auth.username)}`,
    auth
  );

  if (!result.ok) {
    // A 403 means the credentials are valid but this user may not list users; that must not block login.
    if (result.status !== 403) {
      return Response.json({ detail: result.detail }, { status: result.status });
    }
  } else if (result.data.count === 0) {
    return Response.json(
      { detail: "Authenticated but user cannot be found in Pulp users list." },
      { status: 403 }
    );
  }

  let encodedAuth: string;
  try {
    encodedAuth = encodePulpAuth(auth);
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "Failed to encode session." },
      { status: 500 }
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(PULP_AUTH_COOKIE, encodedAuth, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return Response.json({ username: auth.username });
}

export async function GET() {
  const cookieStore = await cookies();
  const encoded = cookieStore.get(PULP_AUTH_COOKIE)?.value;

  if (!encoded) {
    return Response.json({ detail: "Not authenticated." }, { status: 401 });
  }

  const auth = decodePulpAuth(encoded);
  if (!auth) {
    cookieStore.delete(PULP_AUTH_COOKIE);
    return Response.json({ detail: "Invalid session." }, { status: 401 });
  }

  const result = await pulpFetch("/users/?limit=1", auth);
  if (!result.ok) {
    cookieStore.delete(PULP_AUTH_COOKIE);
    return Response.json({ detail: "Session expired." }, { status: 401 });
  }

  return Response.json({ username: auth.username });
}
