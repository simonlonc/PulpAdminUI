import fc from "fast-check";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { normalizePulpHrefToApiPath } from "@/app/api/pulp/repositories/_server";
import { getPulpApiUrl, toBasicAuthHeader } from "@/lib/pulp";
import { buildPulpListParams } from "@/lib/pulp-list-query";
import { PULP_PLUGINS } from "@/lib/pulp-plugins";
import { pulpListQuery } from "@/test/fuzz/arbitraries";

/**
 * X6 -- live-server contract fuzz tier for app/api/pulp/repositories/_server.ts.
 *
 * READ-ONLY: every request in this file is GET, HEAD or OPTIONS. No POST, PATCH, PUT or DELETE --
 * this tier talks to a real Pulp server (see LIVE below), and must never create junk objects or
 * dispatch tasks on it. Only ever reads whatever the server already happens to have, tolerating
 * an empty result set rather than creating fixture data to force one.
 *
 * Skipped unless BOTH PULP_TEST_BASE_URL and FUZZ_LIVE=1 are set. Two independent gates, not one:
 * the ordinary single-guard contract tier (*.contract.test.ts, gated on PULP_TEST_BASE_URL alone,
 * see _server.contract.test.ts next to this file) must not start hitting a real server just
 * because someone points PULP_TEST_BASE_URL at one for a normal `npm run test:contract` run.
 *
 * File name matches *.fuzz.test.ts, so it is already included by vitest.fuzz.config.ts
 * (`npm run fuzz`) and already excluded by vitest.config.ts (`npm test`) -- no config changes.
 *
 *   PULP_TEST_BASE_URL=http://localhost:8080/pulp/api/v3 FUZZ_LIVE=1 npm run fuzz
 *
 * Env vars:
 *   PULP_TEST_BASE_URL  Base URL of the Pulp API. Required, together with FUZZ_LIVE, to run.
 *   FUZZ_LIVE           Must be exactly "1". Required, together with PULP_TEST_BASE_URL, to run.
 *   PULP_TEST_USERNAME  Basic auth username. Defaults to "admin".
 *   PULP_TEST_PASSWORD  Basic auth password. Defaults to "admin".
 *
 * What this file looks for (see TASKS.md epic X, task X6):
 *   (a) a generated, read-only list-query param set that makes Pulp answer 5xx -- our params,
 *       its crash, worth knowing either way. A 4xx is a fine, expected answer for a nonsense
 *       filter/ordering value; the invariant is only that our params never crash the server.
 *   (b) a real list response whose envelope contradicts what the client code assumes
 *       (PulpPaginatedJson<T> in this same file: count/next/previous/results).
 *   (c) a real pulp_href the server returns that normalizePulpHrefToApiPath then mangles, proven
 *       by round-tripping it through getPulpApiUrl (lib/pulp.ts) -- the join function the rest of
 *       the app actually uses to turn a normalized path back into a request URL -- and checking
 *       the rebuilt URL's path matches the original href's path. This is an independent oracle
 *       (per test/fuzz/arbitraries.ts's hygiene rules), not a reimplementation of
 *       normalizePulpHrefToApiPath's own stripping logic.
 *
 * numRuns is kept low (5-15): every run is a real HTTP request against a real server.
 */

const LIVE = process.env.FUZZ_LIVE === "1" && !!process.env.PULP_TEST_BASE_URL;
const describeLive = LIVE ? describe : describe.skip;

const PULP_TEST_BASE_URL = (process.env.PULP_TEST_BASE_URL ?? "").replace(/\/+$/, "");

const authHeader = toBasicAuthHeader({
  username: process.env.PULP_TEST_USERNAME || "admin",
  password: process.env.PULP_TEST_PASSWORD || "admin",
});

/** GET only -- see the file-level comment above for why this tier never issues a write method. */
function liveGet(pathAndQuery: string): Promise<Response> {
  return fetch(`${PULP_TEST_BASE_URL}${pathAndQuery}`, {
    method: "GET",
    headers: { Authorization: authHeader, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
}

const rpm = PULP_PLUGINS.find((plugin) => plugin.kind === "rpm");

describeLive("(a) generated list-query params never make Pulp answer 5xx", () => {
  it(`GET ${rpm?.repositoryPath ?? "<rpm repository path>"} with a fuzzed PulpListQuery never returns 5xx`, async () => {
    if (!rpm) {
      throw new Error("rpm plugin missing from PULP_PLUGINS");
    }
    await fc.assert(
      fc.asyncProperty(pulpListQuery(), async (query) => {
        const params = buildPulpListParams(query);
        const response = await liveGet(`${rpm.repositoryPath}?${params.toString()}`);
        expect(response.status).toBeLessThan(500);
      }),
      { numRuns: 10 }
    );
  }, 60_000);
});

describeLive("(b) list response envelope matches PulpPaginatedJson<T> (count/next/previous/results)", () => {
  it("every 2xx response to a fuzzed PulpListQuery has the envelope the client code assumes", async () => {
    if (!rpm) {
      throw new Error("rpm plugin missing from PULP_PLUGINS");
    }
    await fc.assert(
      fc.asyncProperty(pulpListQuery(), async (query) => {
        const params = buildPulpListParams(query);
        const response = await liveGet(`${rpm.repositoryPath}?${params.toString()}`);
        if (response.status < 200 || response.status >= 300) {
          // (a) above already covers "never 5xx"; a 4xx has no paginated envelope to check.
          return;
        }
        const body = (await response.json()) as Record<string, unknown>;
        expect(typeof body.count).toBe("number");
        expect(body.next === null || typeof body.next === "string").toBe(true);
        expect(body.previous === null || typeof body.previous === "string").toBe(true);
        expect(Array.isArray(body.results)).toBe(true);
      }),
      { numRuns: 10 }
    );
  }, 60_000);
});

describeLive("(c) pulp_href round-trip: normalizePulpHrefToApiPath must not mangle a real Pulp href", () => {
  let realHrefs: string[] = [];

  beforeAll(async () => {
    // Real detail hrefs pulled from whatever each plugin's repository list actually contains
    // today -- not hand-built, so this exercises whatever shape Pulp really emits (host/port,
    // base path, trailing slash) rather than an assumed one. Looping every plugin kind (not just
    // rpm) so a bare/fresh server that only has, say, file repositories still yields something.
    const collected: string[] = [];
    // Every plugin's repository list, PLUS the generic cross-plugin lists. A bare or freshly
    // provisioned server frequently has zero repositories (verified: a live Pulp 3.119.1 with
    // 0 repositories but 1 distribution), which would leave this property passing vacuously.
    // Reading the generic lists too means the round-trip is actually exercised on such a server.
    const sources = [
      ...PULP_PLUGINS.map((plugin) => plugin.repositoryPath),
      "/distributions/",
      "/remotes/",
      "/publications/",
      "/content/",
    ];
    for (const path of sources) {
      const response = await liveGet(`${path}?limit=5`);
      if (response.status !== 200) {
        continue;
      }
      const body = (await response.json()) as { results?: Array<{ pulp_href?: unknown }> };
      for (const item of body.results ?? []) {
        if (typeof item.pulp_href === "string") {
          collected.push(item.pulp_href);
        }
      }
    }
    realHrefs = collected;
  }, 90_000);

  beforeEach(() => {
    // normalizePulpHrefToApiPath/getPulpApiUrl both read PULP_BASE_URL; point it at the same
    // server this tier is fetching from so the round-trip oracle below is checking against a
    // consistent base path.
    vi.stubEnv("PULP_BASE_URL", process.env.PULP_TEST_BASE_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips every pulp_href the server returned, across all plugin repository lists", () => {
    if (realHrefs.length === 0) {
      // Tolerate an empty result set rather than creating fixture data to force this branch --
      // nothing to round-trip this run is not a failure, just nothing this run could check.
      // Said out loud, because a silent vacuous pass is indistinguishable from a real one.
      console.log("  (c) SKIPPED: the server returned no pulp_href to round-trip");
      return;
    }
    console.log(`  (c) round-tripping ${realHrefs.length} real pulp_href value(s)`);
    fc.assert(
      fc.property(fc.constantFrom(...realHrefs), (href) => {
        const normalized = normalizePulpHrefToApiPath(href);
        const rebuiltPath = new URL(getPulpApiUrl(normalized)).pathname;
        // Pulp emits pulp_href RELATIVE ("/pulp/api/v3/repositories/rpm/rpm/<uuid>/"), so the
        // original has to be parsed against a base to get a pathname out of it -- `new URL(href)`
        // alone throws "Invalid URL" on every href a real server returns. The dummy base is only
        // here to make a relative href parseable; it is not a stand-in for the real base path, and
        // this deliberately does no base-stripping of its own (that is the behaviour under test).
        const originalPath = new URL(href, "http://x").pathname;
        expect(rebuiltPath).toBe(originalPath);
      }),
      { numRuns: Math.min(realHrefs.length, 15) }
    );
  });
});
