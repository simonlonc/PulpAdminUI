import { cookies } from "next/headers";
import {
  decodePulpAuth,
  PULP_AUTH_COOKIE,
  PulpAuth,
  pulpFetch,
  pulpLogin,
} from "@/lib/pulp";
import { PulpApiError, readJsonBody, setPulpAuthCookie } from "../_helpers";

type PulpUserCountResponse = { count: number };

export async function POST(request: Request) {
  let payload: Partial<PulpAuth>;

  try {
    payload = (await readJsonBody(request)) as Partial<PulpAuth>;
  } catch (error) {
    const detail = error instanceof PulpApiError ? error.detail : "Invalid request body.";
    return Response.json({ detail }, { status: 400 });
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

  // The password check: Pulp's own session when it has `/login/`, otherwise (404) Basic auth
  // checked by the users lookup below, exactly as before.
  const login = await pulpLogin(auth);
  if (login.kind === "failed") {
    return Response.json({ detail: login.detail }, { status: login.status });
  }
  if (login.kind === "session") {
    auth.pulpSession = login.session;
  }

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

  try {
    await setPulpAuthCookie(auth);
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "Failed to encode session." },
      { status: 500 }
    );
  }

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

  return Response.json({ username: auth.username });
}
