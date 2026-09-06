import { cookies } from "next/headers";
import { decodePulpAuth, PULP_AUTH_COOKIE, type PulpAuth } from "@/lib/pulp";

export async function requirePulpAuth(): Promise<
  { ok: true; auth: PulpAuth } | { ok: false; response: Response }
> {
  const cookieStore = await cookies();
  const encoded = cookieStore.get(PULP_AUTH_COOKIE)?.value;
  if (!encoded) {
    return {
      ok: false,
      response: Response.json({ detail: "Not authenticated." }, { status: 401 }),
    };
  }

  const auth = decodePulpAuth(encoded);
  if (!auth) {
    cookieStore.delete(PULP_AUTH_COOKIE);
    return {
      ok: false,
      response: Response.json({ detail: "Invalid session." }, { status: 401 }),
    };
  }

  return { ok: true, auth };
}

/**
 * Thrown by a `withPulpAuth` handler to report a failed upstream Pulp call. `withPulpAuth`
 * catches it, clears the auth cookie on a 401/403, and turns it into the same
 * `{ detail }` JSON response every route already returned by hand for a `pulpFetch` failure.
 * Any other thrown error passes through `withPulpAuth` unchanged.
 */
export class PulpApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "PulpApiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Wraps a route handler with the `requirePulpAuth` preamble every Pulp API route repeats: run
 * the auth check, hand the decoded `auth` to the handler, and if it throws a `PulpApiError`,
 * clear the auth cookie on a 401/403 and return the standard `{ detail }` JSON response. The
 * dynamic-segment `context` argument (`{ params: Promise<...> }`) is passed through untouched
 * so wrapped handlers can destructure it exactly as they did before.
 *
 * A handful of routes do something genuinely different in their failure path (a non-pulpFetch
 * status fallback, a raw `fetch` alongside `pulpFetch`, ...) and call `requirePulpAuth` directly
 * instead of using this wrapper.
 */
export function withPulpAuth<Context = unknown>(
  handler: (request: Request, auth: PulpAuth, context: Context) => Promise<Response>
) {
  return async (request: Request, context: Context): Promise<Response> => {
    const authResult = await requirePulpAuth();
    if (!authResult.ok) {
      return authResult.response;
    }

    try {
      return await handler(request, authResult.auth, context);
    } catch (error) {
      if (!(error instanceof PulpApiError)) {
        throw error;
      }

      if (error.status === 401 || error.status === 403) {
        const cookieStore = await cookies();
        cookieStore.delete(PULP_AUTH_COOKIE);
      }

      return Response.json({ detail: error.detail }, { status: error.status });
    }
  };
}
