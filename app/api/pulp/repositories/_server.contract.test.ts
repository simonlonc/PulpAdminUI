import { describe, expect, it } from "vitest";

import { buildUpstreamListParams } from "@/app/api/pulp/repositories/_server";
import { PULP_PLUGINS } from "@/lib/pulp-plugins";

/**
 * Contract test: pins the request shape buildUpstreamListParams forwards against a real Pulp
 * server's repository list endpoint. Stubbed fetch tests (_server.test.ts) can confirm the
 * params get built; they cannot confirm Pulp actually accepts them. This tier can.
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

describeContract("GET /repositories/{kind}/ contract", () => {
  it("accepts every param buildUpstreamListParams forwards and answers with a page shape", async () => {
    const rpm = PULP_PLUGINS.find((plugin) => plugin.kind === "rpm");
    if (!rpm) {
      throw new Error("rpm plugin missing from PULP_PLUGINS");
    }

    const qs = buildUpstreamListParams(
      new URLSearchParams({
        limit: "5",
        offset: "0",
        ordering: "name",
        name__icontains: "x",
        pulp_label_select: "env=prod",
        q: "",
      })
    );

    const response = await fetch(`${PULP_TEST_BASE_URL}${rpm.repositoryPath}?${qs.toString()}`, {
      headers: { Authorization: authHeader, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as Record<string, unknown>;
    expect(typeof data.count).toBe("number");
    expect(data).toHaveProperty("next");
    expect(data).toHaveProperty("previous");
    expect(Array.isArray(data.results)).toBe(true);
  }, 15000);
});
