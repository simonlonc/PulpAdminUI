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
 * Parses a request body as JSON and requires the result to be a plain, non-null object -- not a
 * string, number, boolean, or null. Throws a `PulpApiError(400, ...)` for a body that is missing,
 * truncated, or otherwise not valid JSON, and for JSON that parses to something a route can't use
 * as a field bag, so `withPulpAuth` turns either case into the same `{ detail }` 400 response
 * routes already returned by hand for a bad body -- instead of an unguarded `request.json()` (or
 * an `as` cast around it) letting a `SyntaxError`, or a downstream property read on a non-object,
 * escape as a raw 500.
 */
export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new PulpApiError(400, "Invalid request body.");
  }

  if (parsed === null || typeof parsed !== "object") {
    throw new PulpApiError(400, "Invalid request body.");
  }

  return parsed as Record<string, unknown>;
}

/**
 * True only when `data` is a non-null object whose `results` is an array -- the one shape every
 * paginated-list consumer actually needs. `pulpFetch<TData>`'s `data: parsed as TData` is an
 * unchecked cast, so a 2xx body of `42` or `{}` parses fine and satisfies that cast at compile
 * time while having no `results` to read at runtime (F-16). Checked once here instead of per
 * shape: every current caller only ever reads `.results` (and `.count`/`.next` alongside it), so
 * there is nothing yet to gain from a field-level or object-shape guard.
 */
export function isPulpListBody(data: unknown): data is { results: unknown[] } {
  return (
    typeof data === "object" && data !== null && Array.isArray((data as { results?: unknown }).results)
  );
}

/**
 * Throwing wrapper over `isPulpListBody` for `withPulpAuth` handlers that already throw
 * `PulpApiError` on a failed `pulpFetch` call: a 2xx response whose body parses but isn't a
 * results list would otherwise reach a `.map`/`for...of`/index read on `undefined` and escape
 * `withPulpAuth` as an unstyled 500 with no `detail` (F-16). Matches the wording of F-13's
 * `pulpFetch` message in lib/pulp.ts for the same "Pulp returned something unusable" family.
 */
export function expectPulpListBody(data: unknown): void {
  if (!isPulpListBody(data)) {
    throw new PulpApiError(502, "Pulp returned a response body with no results list.");
  }
}

/**
 * Decodes a URI-encoded `pulp_href`, returning null instead of throwing for a malformed
 * percent-encoding (e.g. a lone "%"). The `[id]` route segments that call this hand
 * `decodeURIComponent` a client-supplied, URL-routed string, so it must never throw a
 * `URIError` that would otherwise escape as a body-less 500.
 */
export function decodeRefOrNull(encodedRef: string): string | null {
  try {
    return decodeURIComponent(encodedRef).trim();
  } catch {
    return null;
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
