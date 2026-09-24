/**
 * Fuzz properties for lib/pulp-list-query.ts (parsePulpListQuery,
 * buildPulpListParams, pulpListQueryToUrlParams). Pins F-5: a page number the
 * parser itself can produce from a URL (via Number.parseInt, unbounded) is
 * not necessarily a safe integer, and building Pulp's request params from it
 * can emit an offset in exponential notation instead of a plain digit string.
 *
 * This tier only runs under `npm run fuzz` (see vitest.fuzz.config.ts); it is
 * excluded from `npm test`.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  PULP_PAGE_SIZES,
  buildPulpListParams,
  parsePulpListQuery,
  pulpListQueryToUrlParams,
} from "@/lib/pulp-list-query";
import { pulpListQuery } from "@/test/fuzz/arbitraries";

// Arbitrary digit strings, including ones far longer than any real page count,
// so "page" genuinely inhabits what a URLSearchParams value can hold.
const digitString = fc
  .array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 25 })
  .map((digits) => digits.join(""));

// Arbitrary URLSearchParams-shaped input to the parser: every field a plain
// fc.string() (grapheme-ascii by default), per the hygiene rule against
// hand-rolled string generators that emit unpaired surrogates.
const arbitraryListQueryParams = fc.record({
  search: fc.string(),
  ordering: fc.string(),
  page: fc.string(),
  size: fc.string(),
  label: fc.string(),
  q: fc.string(),
});

describe("pulpListQueryToUrlParams / parsePulpListQuery round-trip", () => {
  it("round-trips every field for any PulpListQuery", () => {
    // Uses the shared pulpListQuery() arbitrary, which draws search/ordering/
    // labelSelect/q from fc.string() -- the exploratory run's 4 false failures
    // here came from a hand-rolled generator emitting unpaired surrogates,
    // which URLSearchParams replaces with U+FFFD per WHATWG semantics. Do not
    // reintroduce that; fc.string() avoids it.
    fc.assert(
      fc.property(pulpListQuery(), (query) => {
        const roundTripped = parsePulpListQuery(pulpListQueryToUrlParams(query));
        expect(roundTripped).toEqual(query);
      })
    );
  });
});

describe("parsePulpListQuery", () => {
  it("F-5: page is always >= 1 and a safe integer, and pageSize is always a known page size", () => {
    // Counterexample: a URL with page=41091115912422540000 parses to
    // page: 41091115912422540000 -- finite and >= 1 (so it survives the
    // existing guard), but not a safe integer.
    fc.assert(
      fc.property(arbitraryListQueryParams, (record) => {
        const query = parsePulpListQuery(new URLSearchParams(record));
        expect(query.page).toBeGreaterThanOrEqual(1);
        expect(Number.isSafeInteger(query.page)).toBe(true);
        expect(PULP_PAGE_SIZES).toContain(query.pageSize);
      }),
      {
        examples: [
          [{ search: "", ordering: "", page: "41091115912422540000", size: "", label: "", q: "" }],
        ],
      }
    );
  });
});

describe("buildPulpListParams", () => {
  it("F-5: emits numeric-string offset and limit for any page the parser can produce", () => {
    // Drives the property through the parser itself (not a hand-built PulpListQuery), so
    // the input genuinely inhabits what parsePulpListQuery returns. Counterexample: page
    // "41091115912422540000" parses to page: 41091115912422540000, and buildPulpListParams
    // then emits offset=4.1091115912422537e+21, which does not match /^\d+$/.
    fc.assert(
      fc.property(digitString, (digits) => {
        const query = parsePulpListQuery(new URLSearchParams({ page: digits }));
        const params = buildPulpListParams(query);
        expect(params.get("offset")).toMatch(/^\d+$/);
        expect(params.get("limit")).toMatch(/^\d+$/);
      }),
      { examples: [["41091115912422540000"]] }
    );
  });
});
