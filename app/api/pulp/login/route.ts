import { PulpAuth, pulpFetch, pulpLogin } from "@/lib/pulp";
import {
  DEFAULT_PULP_BACKEND_ID,
  getPulpBackend,
  listPulpBackends,
  type PulpBackend,
} from "@/lib/pulp-backends";
import { PulpApiError, readJsonBody, requirePulpAuth, setPulpAuthCookie } from "../_helpers";

type PulpUserCountResponse = { count: number };

function chooseBackendFailed(detail: string, status: number) {
  return { ok: false as const, response: Response.json({ detail }, { status }) };
}

// The server this login is for: the one named by `backendId`, or the only one there is.
async function chooseBackend(
  backendId: string | undefined
): Promise<{ ok: true; backend: PulpBackend } | { ok: false; response: Response }> {
  try {
    if (backendId !== undefined) {
      const backend = await getPulpBackend(backendId);
      return backend ? { ok: true, backend } : chooseBackendFailed("Unknown Pulp server.", 400);
    }

    const backends = await listPulpBackends();
    if (backends.length === 0) {
      return chooseBackendFailed("No Pulp server is configured.", 500);
    }
    if (backends.length > 1) {
      return chooseBackendFailed("Choose a Pulp server.", 400);
    }
    return { ok: true, backend: backends[0] };
  } catch {
    // The store has already logged why, and its message names the file.
    return chooseBackendFailed("The Pulp server list cannot be read.", 500);
  }
}

// This route answers callers who are not logged in, so a detail must not carry the server's address.
function withoutBaseUrl(detail: string, backend: PulpBackend): string {
  return detail.replaceAll(backend.baseUrl, backend.label);
}

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

  if (
    payload.backendId !== undefined &&
    (typeof payload.backendId !== "string" || payload.backendId.length === 0)
  ) {
    return Response.json({ detail: "Invalid request body." }, { status: 400 });
  }

  const chosen = await chooseBackend(payload.backendId);
  if (!chosen.ok) {
    return chosen.response;
  }
  const backend = chosen.backend;

  // Only the server list decides where the credentials go, never anything in the request body.
  const auth: PulpAuth = {
    username: payload.username.trim(),
    password: payload.password,
    baseUrl: backend.baseUrl,
  };
  if (backend.id !== DEFAULT_PULP_BACKEND_ID) {
    auth.backendId = backend.id;
  }

  // The password check: Pulp's own session when it has `/login/`, otherwise (404) Basic auth
  // checked by the users lookup below, exactly as before.
  const login = await pulpLogin(auth);
  if (login.kind === "failed") {
    return Response.json({ detail: withoutBaseUrl(login.detail, backend) }, { status: login.status });
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
      return Response.json({ detail: withoutBaseUrl(result.detail, backend) }, { status: result.status });
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
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  return Response.json({ username: authResult.auth.username });
}
