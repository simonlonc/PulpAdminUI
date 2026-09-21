import { getPulpBaseUrl, pulpErrorDetailFromBody, pulpFetch, type PulpAuth } from "@/lib/pulp";
import type { PulpTaskProgressReport } from "@/services/pulp/types";
import {
  type CreatedResourceEntry,
  hrefFromCreatedResource,
  resolvePublicationHrefAfterTask,
} from "@/lib/pulp-task-result";

export type { CreatedResourceEntry };
export { hrefFromCreatedResource, resolvePublicationHrefAfterTask };

export type TaskResponse = {
  state?: string;
  error?: unknown;
  created_resources?: CreatedResourceEntry[];
  pulp_href?: string;
  href?: string;
  progress_reports?: PulpTaskProgressReport[];
};

export type TaskRefResponse = {
  task?: string;
  pulp_href?: string;
  href?: string;
};

export type PulpPaginatedJson<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export async function readDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (text.trim().length === 0) {
      return response.statusText || `Pulp request failed with status ${response.status}.`;
    }
    const payload = JSON.parse(text) as unknown;
    const formatted = pulpErrorDetailFromBody(payload);
    if (formatted) {
      return formatted;
    }
  } catch {
    // Ignore parsing failure.
  }

  return response.statusText || `Pulp request failed with status ${response.status}.`;
}

/** List-query params forwarded from an incoming request to a Pulp list endpoint. */
const FORWARDED_LIST_PARAMS = ["ordering", "name__icontains", "pulp_label_select", "q"] as const;

const NON_NEGATIVE_INTEGER = /^\d+$/;

/** `searchParams.get(key)` if it is a non-negative integer, otherwise `fallback`. */
function nonNegativeIntegerParam(
  searchParams: URLSearchParams,
  key: string,
  fallback: string
): string {
  const value = searchParams.get(key);
  return value !== null && NON_NEGATIVE_INTEGER.test(value) ? value : fallback;
}

/**
 * Builds the query string for a Pulp list endpoint from an incoming request's search params:
 * limit/offset (with their existing defaults) plus an allowlist of ordering/search/label params.
 * Anything not on the allowlist is dropped rather than forwarded blindly. `extraAllowedParams`
 * lets a specific route (e.g. tasks) forward additional param names without making those
 * forwardable from every route that calls this function.
 */
export function buildUpstreamListParams(
  searchParams: URLSearchParams,
  extraAllowedParams: readonly string[] = []
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("limit", nonNegativeIntegerParam(searchParams, "limit", "200"));
  params.set("offset", nonNegativeIntegerParam(searchParams, "offset", "0"));
  for (const key of [...FORWARDED_LIST_PARAMS, ...extraAllowedParams]) {
    const value = searchParams.get(key);
    if (value !== null) {
      params.set(key, value);
    }
  }
  return params;
}

export function getBaseApiPath(): string {
  return new URL(getPulpBaseUrl()).pathname.replace(/\/+$/, "");
}

/**
 * Parses an absolute URL, returning null instead of throwing for a malformed one (bad port
 * punctuation, an unterminated "[", invalid percent-encoding, etc). ~20 routes hand a
 * client-supplied `pulp_href` straight to the functions below, so `new URL(...)` must never
 * throw here.
 */
function parseHrefOrNull(href: string): URL | null {
  try {
    return new URL(href);
  } catch {
    return null;
  }
}

/**
 * The raw path (plus query string, for a relative href) for an absolute or relative pulp_href,
 * with any dot-segments already collapsed. Shared by normalizePulpHrefToApiPath and
 * toPulpHrefPath so the two agree on this step instead of one resolving ".." and the other not.
 */
function resolveHrefPath(href: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return parseHrefOrNull(href)?.pathname ?? "";
  }
  // Resolve against a dummy base so "../" segments are collapsed before the allowlist
  // checks below see the path, while pathname + search keeps the query string intact.
  const resolved = new URL(href, "http://x");
  return resolved.pathname + resolved.search;
}

export function normalizePulpHrefToApiPath(href: string): string {
  const rawPath = resolveHrefPath(href);
  const normalizedRawPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const baseApiPath = getBaseApiPath();

  if (baseApiPath && normalizedRawPath.startsWith(baseApiPath)) {
    const withoutBase = normalizedRawPath.slice(baseApiPath.length);
    return withoutBase.startsWith("/") ? withoutBase : `/${withoutBase}`;
  }

  return normalizedRawPath;
}

export function toPulpHrefPath(href: string): string {
  const rawPath = resolveHrefPath(href);
  const normalizedRawPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const baseApiPath = getBaseApiPath();

  if (baseApiPath && normalizedRawPath.startsWith(baseApiPath)) {
    return normalizedRawPath;
  }

  return `${baseApiPath}${normalizedRawPath}`;
}

export function authHeaders(authHeader: string): Headers {
  const headers = new Headers();
  headers.set("Authorization", authHeader);
  headers.set("Accept", "application/json");
  return headers;
}

export function extractNextApiPath(next: string | null): string | null {
  if (!next) return null;
  const hrefMatch = next.match(/href="([^"]+)"/i);
  const normalized = hrefMatch?.[1] ?? next;
  try {
    const url = new URL(normalized);
    return normalizePulpHrefToApiPath(url.pathname + url.search);
  } catch {
    return normalizePulpHrefToApiPath(normalized);
  }
}

/**
 * The last server-side task wait, kept only for content/rpm/packages, whose failure path needs a
 * server-side duplicate lookup; every other route now returns the dispatched task href and lets the
 * browser poll it (settleDispatchedTask in services/pulp/task-service.ts). The 60x5s cap is fine
 * there because creating content from an already-uploaded artifact is a seconds-long task.
 */
export async function waitForTask(taskHref: string, auth: PulpAuth): Promise<TaskResponse> {
  const maxAttempts = 60;
  const taskPath = normalizePulpHrefToApiPath(taskHref);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await pulpFetch<TaskResponse>(taskPath, auth);
    if (!result.ok) {
      throw new Error(result.detail);
    }

    const task = result.data;
    if (task.state === "completed") {
      return task;
    }

    if (task.state === "failed" || task.state === "canceled") {
      const serializedError =
        typeof task.error === "string" ? task.error : JSON.stringify(task.error ?? "Task failed");
      throw new Error(serializedError);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error("Task did not complete within timeout period.");
}
