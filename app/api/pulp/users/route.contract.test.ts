import { describe, expect, it } from "vitest";

/**
 * Contract test: pins the assumption a later task (L3) relies on -- that Pulp's user list
 * endpoint actually filters by `?username=`, rather than a route forwarding a param the server
 * ignores. See app/api/pulp/users/route.ts, whose GET does not yet forward this param.
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

describeContract("GET /users/?username= contract", () => {
  it("filters by username: a username that cannot exist returns count 0, not the full list", async () => {
    const unfilteredResponse = await get("/users/?limit=1");
    expect(unfilteredResponse.status).toBe(200);
    const unfiltered = (await unfilteredResponse.json()) as { count: number };
    expect(typeof unfiltered.count).toBe("number");

    const noSuchUsername = "pulp-admin-ui-contract-test-nonexistent-user";
    const filteredResponse = await get(`/users/?username=${encodeURIComponent(noSuchUsername)}`);
    expect(filteredResponse.status).toBe(200);
    const filtered = (await filteredResponse.json()) as { count: number; results: unknown[] };
    expect(filtered.count).toBe(0);
    expect(filtered.results).toEqual([]);

    // Stronger proof when the server actually has users (it always does -- at least the account
    // this test authenticates as): if the param were ignored, this non-matching filter would
    // echo the unfiltered count instead of coming back empty.
    if (unfiltered.count > 0) {
      expect(filtered.count).toBeLessThan(unfiltered.count);
    }
  }, 15000);
});
