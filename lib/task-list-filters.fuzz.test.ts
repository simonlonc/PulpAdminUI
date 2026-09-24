/**
 * Fuzz properties for lib/task-list-filters.ts (parsePulpTaskFilters,
 * pulpTaskFiltersToUrlParams, applyPulpTaskFilters). Pins F-11:
 * applyPulpTaskFilters builds started_at__gte / started_at__lte by string
 * concatenation ("${value}T00:00:00.000Z"), with no validation that `value`
 * is actually a "YYYY-MM-DD" date, so an arbitrary startedAfter/startedBefore
 * survives the URL round-trip and is then sent to Pulp as an unparseable
 * timestamp.
 *
 * This tier only runs under `npm run fuzz` (see vitest.fuzz.config.ts); it is
 * excluded from `npm test`.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_PULP_TASK_FILTERS,
  applyPulpTaskFilters,
  parsePulpTaskFilters,
  pulpTaskFiltersToUrlParams,
  type PulpTaskFilters,
} from "@/lib/task-list-filters";

const pulpTaskFiltersArb: fc.Arbitrary<PulpTaskFilters> = fc.record({
  state: fc.string(),
  startedAfter: fc.string(),
  startedBefore: fc.string(),
});

describe("pulpTaskFiltersToUrlParams / parsePulpTaskFilters round-trip", () => {
  it("round-trips every field for arbitrary strings", () => {
    // pulpTaskFiltersToUrlParams always writes all three keys (a filter left at its
    // default is the empty string, per its doc comment) -- so unlike a param that gets
    // omitted, parsePulpTaskFilters's `?? default` fallback never actually triggers here,
    // and the round-trip holds for any string, not just non-default ones.
    fc.assert(
      fc.property(pulpTaskFiltersArb, (filters) => {
        const roundTripped = parsePulpTaskFilters(
          new URLSearchParams(pulpTaskFiltersToUrlParams(filters))
        );
        expect(roundTripped).toEqual(filters);
      })
    );
  });
});

describe("applyPulpTaskFilters", () => {
  it("F-11: started_at__gte / started_at__lte are always valid, canonical ISO-8601 dates", () => {
    // Counterexample: ?started_after=x parses to startedAfter: "x", and
    // applyPulpTaskFilters then emits started_at__gte=xT00:00:00.000Z, which
    // Date.parse cannot read. The authority for both checks is Date itself,
    // not a hand-rolled regex: Date.parse must not be NaN, and Date's own
    // toISOString() must reproduce the emitted string exactly.
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (raw) => {
        const params = new URLSearchParams();
        applyPulpTaskFilters(params, {
          ...DEFAULT_PULP_TASK_FILTERS,
          startedAfter: raw,
          startedBefore: raw,
        });

        for (const key of ["started_at__gte", "started_at__lte"]) {
          const value = params.get(key);
          if (value === null) continue;
          expect(Number.isNaN(Date.parse(value))).toBe(false);
          expect(new Date(value).toISOString()).toBe(value);
        }
      }),
      { examples: [["x"]] }
    );
  });
});
