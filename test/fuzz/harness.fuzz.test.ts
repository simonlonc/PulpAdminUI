/**
 * Smoke test for the fuzz harness itself (see vitest.fuzz.config.ts and
 * test/fuzz/arbitraries.ts). This does not test application code: it proves
 * the four shared arbitraries generate values that inhabit their declared
 * types, and -- by living at `*.fuzz.test.ts` and only running via
 * `npm run fuzz` -- that the include/exclude split between vitest.config.ts
 * and vitest.fuzz.config.ts actually works (see the vitest run in the fuzz
 * tier's README/verification notes: `npm test` must not pick this file up).
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { PULP_PAGE_SIZES } from "@/lib/pulp-list-query";
import { pulpErrorBody, pulpHref, pulpListQuery, pulpTask } from "@/test/fuzz/arbitraries";

describe("pulpListQuery arbitrary", () => {
  it("only generates page sizes from PULP_PAGE_SIZES", () => {
    fc.assert(
      fc.property(pulpListQuery(), (query) => {
        expect(PULP_PAGE_SIZES).toContain(query.pageSize);
      })
    );
  });

  it("only generates page numbers >= 1", () => {
    fc.assert(
      fc.property(pulpListQuery(), (query) => {
        expect(query.page).toBeGreaterThanOrEqual(1);
      })
    );
  });
});

describe("pulpHref arbitrary", () => {
  it("always generates a string", () => {
    fc.assert(
      fc.property(pulpHref(), (href) => {
        expect(typeof href).toBe("string");
      })
    );
  });
});

describe("pulpErrorBody arbitrary", () => {
  it("always generates a JSON-serializable value", () => {
    fc.assert(
      fc.property(pulpErrorBody(), (body) => {
        expect(() => JSON.stringify(body)).not.toThrow();
      })
    );
  });
});

describe("pulpTask arbitrary", () => {
  it("always generates an array of created_resources entries", () => {
    fc.assert(
      fc.property(pulpTask(), (task) => {
        expect(Array.isArray(task.created_resources)).toBe(true);
      })
    );
  });

  it("always generates a state string", () => {
    fc.assert(
      fc.property(pulpTask(), (task) => {
        expect(typeof task.state).toBe("string");
      })
    );
  });
});
