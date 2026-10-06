/**
 * Fuzz properties for lib/content-list-filters.ts: the URL round-trip holds for
 * arbitrary strings, and parseRepositoryVersionHref never throws.
 *
 * This tier only runs under `npm run fuzz` (see vitest.fuzz.config.ts); it is
 * excluded from `npm test`.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  parsePulpContentFilters,
  parseRepositoryVersionHref,
  pulpContentFiltersToUrlParams,
  type PulpContentFilters,
} from "@/lib/content-list-filters";

const pulpContentFiltersArb: fc.Arbitrary<PulpContentFilters> = fc.record({
  repositoryVersion: fc.string(),
  repositoryVersionAdded: fc.string(),
  repositoryVersionRemoved: fc.string(),
  pulpType: fc.string(),
});

describe("pulpContentFiltersToUrlParams / parsePulpContentFilters round-trip", () => {
  it("round-trips every field for arbitrary strings", () => {
    fc.assert(
      fc.property(pulpContentFiltersArb, (filters) => {
        const roundTripped = parsePulpContentFilters(
          new URLSearchParams(pulpContentFiltersToUrlParams(filters))
        );
        expect(roundTripped).toEqual(filters);
      })
    );
  });
});

describe("parseRepositoryVersionHref", () => {
  it("never throws and only returns a non-negative integer version", () => {
    fc.assert(
      fc.property(fc.string(), (href) => {
        const parsed = parseRepositoryVersionHref(href);
        if (parsed !== null) {
          expect(Number.isInteger(parsed.versionNumber)).toBe(true);
          expect(parsed.versionNumber).toBeGreaterThanOrEqual(0);
        }
      })
    );
  });
});
