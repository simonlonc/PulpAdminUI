import { beforeAll, describe, expect, it } from "vitest";

import { derivePulpPlugins } from "@/lib/pulp-plugin-derive";

/**
 * Contract test: pins the assumption the whole derived-registry feature depends on -- that a
 * real Pulp server's /docs/api.json still shapes up into a non-empty set of PulpPluginDescriptor
 * values, well-known families included. Stubbed tests (pulp-plugin-derive.test.ts) exercise the
 * derivation logic against a hand-built fixture; only a live server can confirm the fixture still
 * matches what Pulp actually serves.
 *
 * The document is fetched once, at module scope via beforeAll, and never printed or written to
 * disk -- it's about 6.6 MB.
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

describeContract("derivePulpPlugins against a live /docs/api.json", () => {
  let spec: unknown;

  beforeAll(async () => {
    const response = await fetch(`${PULP_TEST_BASE_URL}/docs/api.json`, {
      headers: { Authorization: authHeader, Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    expect(response.status).toBe(200);
    spec = await response.json();
  }, 30000);

  it("derives a non-empty registry with a well-known rpm family", () => {
    const plugins = derivePulpPlugins(spec);
    expect(plugins.length).toBeGreaterThan(0);

    const rpm = plugins.find((plugin) => plugin.kind === "rpm");
    expect(rpm).toBeDefined();
    expect(rpm?.repositoryPath).toBe("/repositories/rpm/rpm/");
    expect(rpm?.remotePath).toBe("/remotes/rpm/rpm/");
    expect(rpm?.distributionPath).toBe("/distributions/rpm/rpm/");
    expect(Array.isArray(rpm?.contentEndpoints)).toBe(true);
    expect(rpm?.contentEndpoints.length).toBeGreaterThan(0);
  }, 15000);
});
