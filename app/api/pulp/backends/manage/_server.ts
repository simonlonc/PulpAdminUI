import { PulpApiError } from "@/app/api/pulp/_helpers";
import { logError, logWarn } from "@/lib/log";

// Long enough for a slow link, short enough that a black-holed address does not hang the form.
const PROBE_TIMEOUT_MS = 5000;

function probeFailed(baseUrl: string, detail: string): never {
  logWarn("pulp_backend_probe_failed", { url: baseUrl, detail });
  throw new PulpApiError(400, detail);
}

/**
 * Throws a `PulpApiError(400, ...)` unless `baseUrl` (already normalized by the store) answers like
 * a Pulp API. `/status/` is anonymous in Pulp, so no credentials are sent to a server that is not
 * trusted yet, and a `versions` array is what tells a Pulp from any other web server.
 */
export async function probePulpBackend(baseUrl: string): Promise<void> {
  let status: number;
  let body: unknown;
  try {
    const response = await fetch(`${baseUrl}/status/`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    status = response.status;
    body = await response.json().catch(() => undefined);
  } catch (error) {
    // undici puts the readable reason (ECONNREFUSED, ENOTFOUND, ...) on `cause`; its own message
    // is only "fetch failed".
    const reason =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : error instanceof Error
          ? error.message
          : String(error);
    return probeFailed(baseUrl, `Could not reach a Pulp server at ${baseUrl}: ${reason}.`);
  }

  if (status !== 200) {
    return probeFailed(baseUrl, `${baseUrl} did not answer like a Pulp API: /status/ returned ${status}.`);
  }
  if (typeof body !== "object" || body === null || !Array.isArray((body as { versions?: unknown }).versions)) {
    return probeFailed(
      baseUrl,
      `${baseUrl} did not answer like a Pulp API: /status/ did not return a Pulp status.`
    );
  }
}

/**
 * Runs a store call and turns its failure (a list file that is corrupt or cannot be written) into
 * a readable JSON 500 instead of the HTML page an escaping error would become. The store logs a
 * read failure itself; a write failure is only logged here.
 */
export async function guardBackendStore<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    logError("pulp_backends_store_failed", { message: error instanceof Error ? error.message : String(error) });
    throw new PulpApiError(500, "The Pulp server list cannot be read or saved.");
  }
}
