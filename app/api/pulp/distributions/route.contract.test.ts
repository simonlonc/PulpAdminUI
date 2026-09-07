import { describe, expect, it } from "vitest";

/**
 * Contract test: pins the assumption a later task (P3) relies on -- that Pulp's distribution
 * list endpoint actually filters by `?repository=`, rather than the route just forwarding a
 * param the server ignores. See app/api/pulp/distributions/route.ts, which forwards `repository`
 * through buildUpstreamListParams' extraAllowedParams.
 *
 * Skipped entirely -- describe.skip, not a per-test skip -- unless PULP_TEST_BASE_URL is set, so
 * `npm test` never touches the network. Run it with:
 *
 *   PULP_TEST_BASE_URL=http://localhost:8080/pulp/api/v3 npm run test:contract
 *
 * Env vars:
 *   PULP_TEST_BASE_URL  Base URL of the Pulp API, e.g. http://localhost:8080/pulp/api/v3.
 *                        Required. Its presence alone gates this whole tier.
 *   PULP_TEST_USERNAME  Basic auth username. Defaults to "admin".
 *   PULP_TEST_PASSWORD  Basic auth password. Defaults to "admin".
 */

const PULP_TEST_BASE_URL = process.env.PULP_TEST_BASE_URL;
const describeContract = PULP_TEST_BASE_URL ? describe : describe.skip;

const username = process.env.PULP_TEST_USERNAME || "admin";
const password = process.env.PULP_TEST_PASSWORD || "admin";
const authHeader = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;

function get(path: string) {
  return fetch(`${PULP_TEST_BASE_URL}${path}`, {
    headers: { Authorization: authHeader, Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
}

describeContract("GET /distributions/?repository= contract", () => {
  it("filters by repository: an href-shaped value matching nothing returns count 0, not the full list", async () => {
    const unfilteredResponse = await get("/distributions/?limit=1");
    expect(unfilteredResponse.status).toBe(200);
    const unfiltered = (await unfilteredResponse.json()) as { count: number };
    expect(typeof unfiltered.count).toBe("number");

    const noSuchRepositoryHref = "/pulp/api/v3/repositories/rpm/rpm/00000000-0000-0000-0000-000000000000/";
    const filteredResponse = await get(`/distributions/?repository=${encodeURIComponent(noSuchRepositoryHref)}`);
    expect(filteredResponse.status).toBe(200);
    const filtered = (await filteredResponse.json()) as { count: number; results: unknown[] };
    expect(filtered.count).toBe(0);
    expect(filtered.results).toEqual([]);

    // Stronger proof when the server actually has distributions: if the param were ignored, this
    // non-matching filter would echo the unfiltered count instead of coming back empty.
    if (unfiltered.count > 0) {
      expect(filtered.count).toBeLessThan(unfiltered.count);
    }
  }, 15000);
});

/**
 * Contract test: pins the same assumption for the plugin-specific distribution path (e.g.
 * /distributions/rpm/rpm/) that app/api/pulp/distributions/create/[kind]/route.ts actually calls
 * from findFirstLinkedDistributionHref -- a single `?repository=` filtered request replaces what
 * used to be a full paginated scan of every distribution of that family.
 */
describeContract("GET /distributions/rpm/rpm/?repository= contract", () => {
  it("filters by repository: matches an existing distribution's repository and excludes a nonexistent one", async () => {
    const unfilteredResponse = await get("/distributions/rpm/rpm/?limit=1");
    expect(unfilteredResponse.status).toBe(200);
    const unfiltered = (await unfilteredResponse.json()) as {
      count: number;
      results: Array<{ pulp_href: string; repository: string | null }>;
    };
    expect(typeof unfiltered.count).toBe("number");

    const noSuchRepositoryHref = "/pulp/api/v3/repositories/rpm/rpm/00000000-0000-0000-0000-000000000000/";
    const noMatchResponse = await get(
      `/distributions/rpm/rpm/?repository=${encodeURIComponent(noSuchRepositoryHref)}&limit=1`
    );
    expect(noMatchResponse.status).toBe(200);
    const noMatch = (await noMatchResponse.json()) as { count: number; results: unknown[] };
    expect(noMatch.count).toBe(0);
    expect(noMatch.results).toEqual([]);

    // Strongest proof, when the server has a distribution bound to a repository: filtering by
    // that exact repository href returns it.
    const existing = unfiltered.results[0];
    if (existing?.repository) {
      const matchResponse = await get(
        `/distributions/rpm/rpm/?repository=${encodeURIComponent(existing.repository)}&limit=1`
      );
      expect(matchResponse.status).toBe(200);
      const match = (await matchResponse.json()) as {
        count: number;
        results: Array<{ pulp_href: string }>;
      };
      expect(match.count).toBeGreaterThan(0);
      expect(match.results.some((row) => row.pulp_href === existing.pulp_href)).toBe(true);
    }
  }, 15000);
});
