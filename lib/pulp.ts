import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { logError, logWarn } from "@/lib/log";

export const PULP_AUTH_COOKIE = "pulp_auth";

// Pulp's own login session (`POST /login/`): far cheaper per request than Basic auth, which makes
// Pulp hash the password on every call. Optional because older Pulp servers have no `/login/`.
export type PulpSession = {
  sessionid: string;
  csrftoken: string;
};

export type PulpAuth = {
  username: string;
  password: string;
  pulpSession?: PulpSession;
  // Which entry of the Pulp server list (lib/pulp-backends.ts) this session belongs to. Stored in
  // the cookie; absent means the default backend, so older and single-server cookies keep their shape.
  backendId?: string;
  // That server's base URL, resolved from backendId on every request and never put in the cookie.
  baseUrl?: string;
};

/**
 * Pulp/DRF may return { detail: "..." }, { detail: [...] }, or field keys like { name: ["..."] }.
 */
export function pulpErrorDetailFromBody(body: unknown): string | null {
  if (body === null || typeof body !== "object") {
    return null;
  }

  // A bare top-level list of messages, e.g. Pulp's 400 for an importer whose repo_mapping names a
  // repository that does not exist. Left to the field loop below it would come out as "0: <message>".
  if (Array.isArray(body)) {
    const joined = body
      .map((x) => (typeof x === "string" ? x.trim() : JSON.stringify(x)))
      .filter((m) => m.length > 0)
      .join(" ");
    if (joined.length > 0) {
      return joined.slice(0, 500);
    }
  }

  const o = body as Record<string, unknown>;
  const detail = o.detail;

  // Capped at 500 characters, the same as pulpFetch's own non-JSON error snippet below: a
  // deeply-nested field value (or a very long detail string) can otherwise run to thousands of
  // characters and land straight in the UI.
  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail.trim().slice(0, 500);
  }

  if (Array.isArray(detail)) {
    const parts = detail.map((x) => (typeof x === "string" ? x : JSON.stringify(x)));
    const joined = parts.filter((p) => p.length > 0).join(" ");
    if (joined.length > 0) {
      return joined.slice(0, 500);
    }
  }

  const fieldParts: string[] = [];
  for (const [key, val] of Object.entries(o)) {
    if (key === "detail" || key === "non_field_errors") {
      continue;
    }
    if (typeof val === "string" && val.trim().length > 0) {
      fieldParts.push(`${key}: ${val.trim()}`);
    } else if (Array.isArray(val)) {
      const msgs = val
        .map((x) => (typeof x === "string" ? x.trim() : JSON.stringify(x)))
        .filter((m) => m.length > 0);
      if (msgs.length > 0) {
        fieldParts.push(`${key}: ${msgs.join("; ")}`);
      }
    } else if (val !== null && typeof val === "object") {
      fieldParts.push(`${key}: ${JSON.stringify(val)}`);
    }
  }

  const nonField = o.non_field_errors;
  if (Array.isArray(nonField)) {
    const msgs = nonField
      .map((x) => (typeof x === "string" ? x.trim() : JSON.stringify(x)))
      .filter((m) => m.length > 0);
    if (msgs.length > 0) {
      fieldParts.unshift(msgs.join("; "));
    }
  }

  if (fieldParts.length > 0) {
    return fieldParts.join(" ").slice(0, 500);
  }

  return null;
}

export function getPulpBaseUrl(auth?: PulpAuth): string {
  if (auth?.baseUrl !== undefined) {
    return auth.baseUrl;
  }

  const rawValue = process.env.PULP_BASE_URL?.trim();
  if (!rawValue) {
    throw new Error("Missing PULP_BASE_URL environment variable.");
  }

  return rawValue.replace(/\/+$/, "");
}

export function getPulpApiUrl(pathname: string, auth?: PulpAuth): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${getPulpBaseUrl(auth)}${normalizedPath}`;
}

export function toBasicAuthHeader(auth: PulpAuth): string {
  const encoded = Buffer.from(`${auth.username}:${auth.password}`, "utf8").toString(
    "base64"
  );
  return `Basic ${encoded}`;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The credential headers for one Pulp request: the Pulp session cookie when `auth` has one (plus
 * the CSRF token and a same-origin Referer on unsafe methods, which Django requires), Basic
 * otherwise. Shared by pulpFetch and the routes that call Pulp with a raw `fetch`.
 */
export function pulpAuthHeaders(auth: PulpAuth, method = "GET"): Headers {
  const headers = new Headers();
  const session = auth.pulpSession;
  if (!session) {
    headers.set("Authorization", toBasicAuthHeader(auth));
    return headers;
  }

  headers.set("Cookie", `sessionid=${session.sessionid}; csrftoken=${session.csrftoken}`);
  if (!SAFE_METHODS.has(method.toUpperCase())) {
    headers.set("X-CSRFToken", session.csrftoken);
    headers.set("Referer", `${new URL(getPulpBaseUrl(auth)).origin}/`);
  }
  return headers;
}

const PULP_AUTH_IV_LENGTH = 12;
const PULP_AUTH_AUTH_TAG_LENGTH = 16;

function getPulpSessionKey(): Buffer {
  const secret = process.env.PULP_SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "PULP_SESSION_SECRET is not set. Generate one with: openssl rand -base64 32"
    );
  }

  return createHash("sha256").update(secret, "utf8").digest();
}

export function encodePulpAuth(auth: PulpAuth): string {
  const key = getPulpSessionKey();
  const iv = randomBytes(PULP_AUTH_IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  // Explicit fields only, so the runtime-only baseUrl can never reach the cookie.
  const payload = {
    username: auth.username,
    password: auth.password,
    pulpSession: auth.pulpSession,
    backendId: auth.backendId,
  };
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]).toString("base64url");
}

export function decodePulpAuth(value: string): PulpAuth | null {
  try {
    const key = getPulpSessionKey();
    const raw = Buffer.from(value, "base64url");

    if (raw.length < PULP_AUTH_IV_LENGTH + PULP_AUTH_AUTH_TAG_LENGTH) {
      return null;
    }

    const iv = raw.subarray(0, PULP_AUTH_IV_LENGTH);
    const authTag = raw.subarray(
      PULP_AUTH_IV_LENGTH,
      PULP_AUTH_IV_LENGTH + PULP_AUTH_AUTH_TAG_LENGTH
    );
    const ciphertext = raw.subarray(PULP_AUTH_IV_LENGTH + PULP_AUTH_AUTH_TAG_LENGTH);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decoded = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<PulpAuth> & {
      pulpSession?: unknown;
      backendId?: unknown;
    };

    if (
      typeof parsed.username !== "string" ||
      parsed.username.length === 0 ||
      typeof parsed.password !== "string" ||
      parsed.password.length === 0
    ) {
      return null;
    }

    // Cookies for the default backend, and those written before backends existed, have none.
    if (
      parsed.backendId !== undefined &&
      (typeof parsed.backendId !== "string" || parsed.backendId.length === 0)
    ) {
      return null;
    }
    const backend = parsed.backendId === undefined ? {} : { backendId: parsed.backendId };

    // Cookies written before Pulp sessions existed have no pulpSession and keep working with Basic.
    if (parsed.pulpSession === undefined) {
      return {
        username: parsed.username,
        password: parsed.password,
        ...backend,
      };
    }

    const session = parsed.pulpSession as Partial<PulpSession> | null;
    if (
      session === null ||
      typeof session !== "object" ||
      typeof session.sessionid !== "string" ||
      session.sessionid.length === 0 ||
      typeof session.csrftoken !== "string" ||
      session.csrftoken.length === 0
    ) {
      return null;
    }

    return {
      username: parsed.username,
      password: parsed.password,
      pulpSession: { sessionid: session.sessionid, csrftoken: session.csrftoken },
      ...backend,
    };
  } catch {
    return null;
  }
}

// A successful Pulp call is only logged when it takes at least this long.
const SLOW_FETCH_MS = 5000;

// Origin plus pathname: which host and port, and which endpoint, without the query string
// (which can carry user search text) or any userinfo in PULP_BASE_URL.
export function loggableUrl(apiUrl: string): string {
  try {
    const { origin, pathname } = new URL(apiUrl);
    return `${origin}${pathname}`;
  } catch {
    return "unparseable";
  }
}

// undici reports a refused or unresolvable connection as `TypeError: fetch failed` and puts the
// errno, address and port on `error.cause`, so the useful primitives are copied out of it.
function fetchCauseFields(error: unknown) {
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause === null || typeof cause !== "object") {
    return {};
  }

  const { code, message, address } = cause as Record<string, unknown>;
  return {
    cause_code: typeof code === "string" ? code : undefined,
    cause_message: typeof message === "string" && message.length > 0 ? message : undefined,
    cause_address: typeof address === "string" ? address : undefined,
  };
}

function pulpFailureDetail(response: Response, rawText: string, parsed: unknown): string {
  const fromJson = pulpErrorDetailFromBody(parsed);
  if (fromJson != null) {
    return fromJson;
  }

  const nonJsonSnippet =
    rawText.length > 0 && parsed === undefined ? rawText.trim().slice(0, 500) : "";
  if (nonJsonSnippet.length > 0) {
    return nonJsonSnippet;
  }

  const statusText = response.statusText.trim();
  if (statusText.length > 0) {
    return statusText;
  }
  return `Pulp request failed with status ${response.status}.`;
}

export type PulpLoginResult =
  | { kind: "session"; session: PulpSession }
  // Pulp before 3.70 has no `/login/` (404), or it answered without session cookies: keep
  // using Basic.
  | { kind: "unsupported" }
  | { kind: "failed"; status: number; detail: string };

function cookieValueFromSetCookie(setCookies: string[], name: string): string | null {
  for (const line of setCookies) {
    const pair = line.split(";", 1)[0];
    const eq = pair.indexOf("=");
    if (eq > 0 && pair.slice(0, eq).trim() === name) {
      const value = pair.slice(eq + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

/**
 * `POST /login/` with Basic: the password check and, on a Pulp that has the endpoint, the session
 * to use instead of Basic from then on. Needs a raw fetch because pulpFetch drops the response
 * headers that carry the cookies.
 */
export async function pulpLogin(auth: PulpAuth): Promise<PulpLoginResult> {
  const apiUrl = getPulpApiUrl("/login/", auth);
  const startedAt = performance.now();

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: toBasicAuthHeader(auth),
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError("pulp_fetch_unreachable", {
      method: "POST",
      url: loggableUrl(apiUrl),
      message,
      ...fetchCauseFields(error),
      ms: Math.round(performance.now() - startedAt),
    });
    return {
      kind: "failed",
      status: 502,
      detail: `Could not reach Pulp server at ${getPulpBaseUrl(auth)}: ${message}`,
    };
  }

  const rawText = await response.text();

  if (response.status === 404) {
    return { kind: "unsupported" };
  }

  if (!response.ok) {
    let parsed: unknown;
    try {
      parsed = rawText.length > 0 ? (JSON.parse(rawText) as unknown) : undefined;
    } catch {
      parsed = undefined;
    }
    const detail = pulpFailureDetail(response, rawText, parsed);
    logWarn("pulp_fetch_failed", {
      method: "POST",
      url: loggableUrl(apiUrl),
      status: response.status,
      detail,
      ms: Math.round(performance.now() - startedAt),
    });
    return { kind: "failed", status: response.status, detail };
  }

  const setCookies = response.headers.getSetCookie();
  const sessionid = cookieValueFromSetCookie(setCookies, "sessionid");
  const csrftoken = cookieValueFromSetCookie(setCookies, "csrftoken");
  if (!sessionid || !csrftoken) {
    return { kind: "unsupported" };
  }
  return { kind: "session", session: { sessionid, csrftoken } };
}

/** Best-effort `DELETE /login/`: ends the Pulp session. Never throws, the outcome is ignored. */
export async function pulpLogout(auth: PulpAuth): Promise<void> {
  if (!auth.pulpSession) {
    return;
  }
  try {
    const response = await fetch(getPulpApiUrl("/login/", auth), {
      method: "DELETE",
      headers: pulpAuthHeaders(auth, "DELETE"),
      cache: "no-store",
    });
    await response.text();
  } catch {
    // The cookie is cleared by the caller regardless.
  }
}

// Auth objects whose session was replaced while a request ran; withPulpAuth writes those back to
// the cookie, the only place that can (a route handler).
const renewedAuths = new WeakSet<PulpAuth>();
const pendingRenewals = new WeakMap<PulpAuth, Promise<boolean>>();

/** True once (and clears the mark) if pulpFetch replaced or dropped `auth`'s Pulp session. */
export function takePulpAuthRenewal(auth: PulpAuth): boolean {
  return renewedAuths.delete(auth);
}

// Logs in again with the stored password, updating `auth` in place. Concurrent callers for the
// same auth share one login. False when Pulp refused (e.g. the password changed).
function renewPulpSession(auth: PulpAuth): Promise<boolean> {
  const pending = pendingRenewals.get(auth);
  if (pending) {
    return pending;
  }

  const renewal = pulpLogin(auth)
    .then((result) => {
      if (result.kind === "failed") {
        return false;
      }
      if (result.kind === "session") {
        auth.pulpSession = result.session;
      } else {
        delete auth.pulpSession;
      }
      renewedAuths.add(auth);
      return true;
    })
    .finally(() => {
      pendingRenewals.delete(auth);
    });
  pendingRenewals.set(auth, renewal);
  return renewal;
}

function isReplayableBody(body: RequestInit["body"]): boolean {
  return (
    body === undefined ||
    body === null ||
    typeof body === "string" ||
    body instanceof URLSearchParams ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body)
  );
}

export async function pulpFetch<TData>(
  pathname: string,
  auth: PulpAuth,
  init?: RequestInit
): Promise<{ ok: true; status: number; data: TData } | { ok: false; status: number; detail: string }> {
  const apiUrl = getPulpApiUrl(pathname, auth);
  const method = (init?.method ?? "GET").toUpperCase();
  const startedAt = performance.now();

  let response: Response;
  let renewalTried = false;
  for (;;) {
    const headers = new Headers(init?.headers);
    headers.delete("Authorization");
    pulpAuthHeaders(auth, method).forEach((value, name) => headers.set(name, value));
    headers.set("Accept", "application/json");

    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const usedSession = auth.pulpSession;
    try {
      response = await fetch(apiUrl, {
        ...init,
        headers,
        cache: "no-store",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError("pulp_fetch_unreachable", {
        method,
        url: loggableUrl(apiUrl),
        message,
        ...fetchCauseFields(error),
        ms: Math.round(performance.now() - startedAt),
      });
      return {
        ok: false,
        status: 502,
        detail: `Could not reach Pulp server at ${getPulpBaseUrl(auth)}: ${message}`,
      };
    }

    // A rejected Pulp session is renewed once with the stored password and the request retried.
    // If another request already replaced the session this one used, just retry with the new one.
    if (response.status !== 401 || !usedSession || renewalTried) {
      break;
    }
    renewalTried = true;
    if (auth.pulpSession === usedSession && !(await renewPulpSession(auth))) {
      break;
    }
    if (!isReplayableBody(init?.body)) {
      break;
    }
    // Drain, not cancel: under Next's patched fetch the body can be one branch of a tee, and
    // cancelling one branch waits for the other, so `body.cancel()` hung the request forever.
    await response.text();
  }

  const rawText = await response.text();
  let parsed: unknown;
  if (rawText.length > 0) {
    try {
      parsed = JSON.parse(rawText) as unknown;
    } catch {
      parsed = undefined;
    }
  } else {
    parsed = undefined;
  }

  const ms = Math.round(performance.now() - startedAt);

  if (response.ok && ms >= SLOW_FETCH_MS) {
    logWarn("pulp_fetch_slow", { method, url: loggableUrl(apiUrl), status: response.status, ms });
  }

  if (!response.ok) {
    const detail = pulpFailureDetail(response, rawText, parsed);
    logWarn("pulp_fetch_failed", { method, url: loggableUrl(apiUrl), status: response.status, detail, ms });
    return { ok: false, status: response.status, detail };
  }

  if (response.status === 204) {
    // No Content: callers that expect a body never read `.data` for this status (see
    // users/groups/roles/contentguards/publications DELETE), so there is nothing to validate.
    return { ok: true, status: response.status, data: undefined as TData };
  }

  if (parsed === undefined || parsed === null) {
    // A 2xx with a missing, unparseable, or literal-null body is not a shape any caller can use:
    // every other 2xx caller immediately dereferences `.data`, so returning it as `TData` here
    // only trades a clean error now for an uncaught TypeError at the call site. Report it the
    // same way an upstream failure is reported instead.
    logWarn("pulp_fetch_bad_body", { method, url: loggableUrl(apiUrl), status: response.status, ms });
    return {
      ok: false,
      status: 502,
      detail: `Pulp returned an empty or unparseable body for a ${response.status} response.`,
    };
  }

  return {
    ok: true,
    status: response.status,
    data: parsed as TData,
  };
}
