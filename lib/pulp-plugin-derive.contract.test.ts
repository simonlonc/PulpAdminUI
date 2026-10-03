import { beforeAll, describe, expect, it } from "vitest";

import {
  KNOWN_UNRENDERED_REMOTE_BASE_FIELDS,
  KNOWN_UNRENDERED_REPOSITORY_BASE_FIELDS,
  RENDERED_REMOTE_BASE_FIELDS,
  RENDERED_REPOSITORY_BASE_FIELDS,
  derivedExcludedBaseFields,
  derivePulpPlugins,
  pulpDefaultHint,
} from "@/lib/pulp-plugin-derive";

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

  describe("base field coverage", () => {
    const cases = [
      {
        resource: "remote",
        rendered: RENDERED_REMOTE_BASE_FIELDS,
        gaps: KNOWN_UNRENDERED_REMOTE_BASE_FIELDS,
      },
      {
        resource: "repository",
        rendered: RENDERED_REPOSITORY_BASE_FIELDS,
        gaps: KNOWN_UNRENDERED_REPOSITORY_BASE_FIELDS,
      },
    ] as const;

    for (const { resource, rendered, gaps } of cases) {
      it(`excludes no ${resource} field that is neither rendered nor a known gap`, () => {
        const excluded = derivedExcludedBaseFields(spec)[resource];
        const unaccounted = [...excluded].filter((n) => !rendered.includes(n) && !gaps.includes(n));
        expect(unaccounted, `${resource} base fields dropped by the deriver and not rendered`).toEqual([]);
      });

      it(`lists no ${resource} known gap that is also rendered`, () => {
        const both = gaps.filter((n) => rendered.includes(n));
        expect(both, `${resource} fields in both the rendered and known-gap lists`).toEqual([]);
      });

      it(`lists only ${resource} fields that are really excluded`, () => {
        const excluded = derivedExcludedBaseFields(spec)[resource];
        const stale = [...rendered, ...gaps].filter((n) => !excluded.has(n));
        expect(stale, `${resource} listed fields the deriver no longer excludes`).toEqual([]);
      });
    }
  });

  describe("base field hints", () => {
    function remoteProperty(name: string): unknown {
      const root = spec as { components: { schemas: Record<string, { properties: Record<string, unknown> }> } };
      return root.components.schemas["file.FileRemote"].properties[name];
    }

    it("derives 'Pulp default (3)' for max_retries and a bare hint for the others without a stated number", () => {
      expect(pulpDefaultHint(remoteProperty("max_retries")).placeholder).toBe("Pulp default (3)");
      expect(pulpDefaultHint(remoteProperty("download_concurrency"))).toEqual({
        placeholder: "Pulp default",
        minimum: 1,
      });
      expect(pulpDefaultHint(remoteProperty("total_timeout"))).toEqual({
        placeholder: "Pulp default",
        minimum: 0,
      });
    });

    it("attaches hints for every base tuning field to every derived family", () => {
      for (const plugin of derivePulpPlugins(spec)) {
        const hints = plugin.baseFieldHints ?? {};
        for (const name of ["download_concurrency", "max_retries", "retain_checkpoints", "hidden"]) {
          expect(hints[name], `${plugin.kind} ${name}`).toBeDefined();
        }
        expect(hints.hidden.default).toBe(false);
        expect(hints.max_retries.placeholder).toBe("Pulp default (3)");
      }
    });
  });
});
