/**
 * Fuzz properties for app/api/pulp/repositories/_server.ts:
 * normalizePulpHrefToApiPath, toPulpHrefPath, extractNextApiPath and
 * buildUpstreamListParams. About 20 routes hand a client-supplied `pulp_href`
 * to one of the first three, and withPulpAuth (app/api/pulp/_helpers.ts:70)
 * rethrows anything that is not a PulpApiError -- so an uncaught TypeError
 * here reaches Next as a raw 500 with no `detail` for the client to render.
 *
 * F-1 (currently broken): normalizePulpHrefToApiPath (:82), toPulpHrefPath
 * (:103) and extractNextApiPath (:124) all call `new URL(...)` unguarded on
 * anything starting "http://" or "https://". A malformed authority (bad port
 * punctuation, an unterminated "[", invalid percent-encoding) makes `new
 * URL()` throw, and none of the three catches it.
 *
 * F-7 (currently broken): normalizePulpHrefToApiPath and toPulpHrefPath are
 * twins that disagree on dot-segment handling. normalizePulpHrefToApiPath
 * resolves the href against a dummy base first (collapsing ".." before the
 * base-path allowlist ever sees the path -- Epic L4 hardened this, including
 * "%2e%2e"); toPulpHrefPath does not, so a ".." survives straight through to
 * the prefixed result.
 *
 * F-6 (currently broken): buildUpstreamListParams allowlists param NAMES and
 * never validates VALUES; limit/offset are forwarded verbatim regardless of
 * shape.
 *
 * This tier only runs under `npm run fuzz` (see vitest.fuzz.config.ts); it is
 * excluded from `npm test`.
 */

import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildUpstreamListParams,
  extractNextApiPath,
  normalizePulpHrefToApiPath,
  toPulpHrefPath,
} from "@/app/api/pulp/repositories/_server";
import { pulpHref } from "@/test/fuzz/arbitraries";

// Mirrors FORWARDED_LIST_PARAMS in _server.ts, read as data (not re-derived logic): the
// invariant under test is that buildUpstreamListParams never forwards a param name outside
// this set plus limit/offset plus whatever extraAllowedParams the caller passed in.
const FORWARDED_LIST_PARAMS = ["ordering", "name__icontains", "pulp_label_select", "q"];

// Absolute hrefs whose authority makes `new URL()` throw -- bad port punctuation, an
// unterminated "[", and invalid percent-encoding respectively.
const F1_EXAMPLES: [string][] = [
  ["http://h:8080;/repositories/"],
  ["http://[/repositories/"],
  ["https://%%/repositories/"],
];

/** The path component of a normalizePulpHrefToApiPath/toPulpHrefPath result, split off its query string. */
function pathComponent(result: string): string {
  return result.split("?")[0];
}

describe("with PULP_BASE_URL stubbed", () => {
  beforeEach(() => {
    vi.stubEnv("PULP_BASE_URL", "http://localhost:8080/pulp/api/v3");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("normalizePulpHrefToApiPath", () => {
    it("F-1: never throws, including on absolute hrefs with a malformed authority", () => {
      fc.assert(
        fc.property(pulpHref(), (href) => {
          expect(() => normalizePulpHrefToApiPath(href)).not.toThrow();
        }),
        { examples: F1_EXAMPLES }
      );
    });

    it("pin: never leaves a dot-segment in the path component, for any href shape including %2e%2e", () => {
      // Also the observable evidence for the "not broken" pin that dot-segments are
      // collapsed before the base-path allowlist runs: the allowlist only ever sees
      // normalizedRawPath, which this proves is always already dot-segment-free.
      fc.assert(
        fc.property(pulpHref(), (href) => {
          let result: string;
          try {
            result = normalizePulpHrefToApiPath(href);
          } catch {
            // F-1 covers the inputs that make this throw; out of scope for this property.
            return;
          }
          const segments = pathComponent(result).split("/");
          expect(segments).not.toContain(".");
          expect(segments).not.toContain("..");
        })
      );
    });
  });

  describe("toPulpHrefPath", () => {
    it("F-1: never throws, including on absolute hrefs with a malformed authority", () => {
      fc.assert(
        fc.property(pulpHref(), (href) => {
          expect(() => toPulpHrefPath(href)).not.toThrow();
        }),
        { examples: F1_EXAMPLES }
      );
    });

    it("F-7: never leaves a dot-segment in the path component", () => {
      // Counterexample: toPulpHrefPath("/repositories/../../signing-services/") returns
      // "/pulp/api/v3/repositories/../../signing-services/" -- the ".." segments are
      // never resolved, unlike normalizePulpHrefToApiPath's twin behavior above.
      fc.assert(
        fc.property(pulpHref(), (href) => {
          let result: string;
          try {
            result = toPulpHrefPath(href);
          } catch {
            // F-1 covers the inputs that make this throw; out of scope for this property.
            return;
          }
          const segments = pathComponent(result).split("/");
          expect(segments).not.toContain(".");
          expect(segments).not.toContain("..");
        }),
        { examples: [["/repositories/../../signing-services/"]] }
      );
    });
  });

  describe("extractNextApiPath", () => {
    it("F-1: never throws, including on absolute hrefs with a malformed authority", () => {
      fc.assert(
        fc.property(pulpHref(), (href) => {
          expect(() => extractNextApiPath(href)).not.toThrow();
        }),
        { examples: F1_EXAMPLES }
      );
    });
  });
});

describe("buildUpstreamListParams", () => {
  it("F-1: never throws for any string values of limit/offset", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (limit, offset) => {
        expect(() => buildUpstreamListParams(new URLSearchParams({ limit, offset }))).not.toThrow();
      })
    );
  });

  it("F-6: limit and offset in the result always match /^\\d+$/", () => {
    // Counterexample: ?limit=abc&offset=../../x forwards limit: "abc" and
    // offset: "../../x" verbatim -- buildUpstreamListParams allowlists param
    // names, not values.
    fc.assert(
      fc.property(fc.string(), fc.string(), (limit, offset) => {
        const params = buildUpstreamListParams(new URLSearchParams({ limit, offset }));
        expect(params.get("limit")).toMatch(/^\d+$/);
        expect(params.get("offset")).toMatch(/^\d+$/);
      }),
      { examples: [["abc", "../../x"]] }
    );
  });

  it("pin: never forwards a param name outside FORWARDED_LIST_PARAMS plus extraAllowedParams plus limit/offset", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1 }), fc.string(), { maxKeys: 10 }),
        fc.array(fc.string({ minLength: 1 }), { maxLength: 3 }),
        (paramRecord, extraAllowedParams) => {
          const searchParams = new URLSearchParams(paramRecord);
          const result = buildUpstreamListParams(searchParams, extraAllowedParams);
          const allowed = new Set(["limit", "offset", ...FORWARDED_LIST_PARAMS, ...extraAllowedParams]);
          for (const key of result.keys()) {
            expect(allowed.has(key)).toBe(true);
          }
        }
      )
    );
  });
});
