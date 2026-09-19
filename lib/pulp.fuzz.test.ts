/**
 * Fuzz properties for the pure exports of lib/pulp.ts: encodePulpAuth /
 * decodePulpAuth and pulpErrorDetailFromBody. Pins F-8: pulpErrorDetailFromBody
 * has no length cap, so a deeply-nested error body can produce a detail
 * string far longer than the 500-character cap pulpFetch applies to its own
 * non-JSON error snippet (see the `slice(0, 500)` call in lib/pulp.ts).
 *
 * pulpFetch itself is not fuzzed here -- that needs a stubbed fetch and is a
 * later task. This tier only runs under `npm run fuzz` (see
 * vitest.fuzz.config.ts); it is excluded from `npm test`.
 */

import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decodePulpAuth, encodePulpAuth, pulpErrorDetailFromBody } from "@/lib/pulp";
import { pulpErrorBody } from "@/test/fuzz/arbitraries";

// Full unicode graphemes, not just grapheme-ascii: the round-trip is claimed
// to hold for every unicode string, so exercise that alphabet via fc.string()
// itself rather than a hand-rolled generator.
const nonEmptyUnicodeString = fc.string({ unit: "grapheme", minLength: 1 });

// A deeply-nested error body whose JSON.stringify'd field value alone is
// already well past 500 characters -- the exploratory run got 2,460
// characters out of a body like this.
const oversizedNestedBody = {
  field: {
    aaaaaa: {
      bbbbbb: {
        cccccc: {
          dddddd: {
            eeeeee: [
              "a".repeat(100),
              "b".repeat(100),
              "c".repeat(100),
              "d".repeat(100),
              "e".repeat(100),
              "f".repeat(100),
              "g".repeat(100),
              "h".repeat(100),
            ],
          },
        },
      },
    },
  },
};

describe("encodePulpAuth / decodePulpAuth", () => {
  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips any non-empty username and password", () => {
    fc.assert(
      fc.property(
        fc.record({ username: nonEmptyUnicodeString, password: nonEmptyUnicodeString }),
        (auth) => {
          expect(decodePulpAuth(encodePulpAuth(auth))).toEqual(auth);
        }
      )
    );
  });

  it("never throws, and returns null or an object with two non-empty string fields, for any string", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        let result: ReturnType<typeof decodePulpAuth>;
        expect(() => {
          result = decodePulpAuth(value);
        }).not.toThrow();
        if (result !== null) {
          expect(typeof result!.username).toBe("string");
          expect(result!.username.length).toBeGreaterThan(0);
          expect(typeof result!.password).toBe("string");
          expect(result!.password.length).toBeGreaterThan(0);
        }
      })
    );
  });
});

describe("pulpErrorDetailFromBody", () => {
  it("F-8: never throws, and returns null or a non-empty string of at most 500 characters", () => {
    fc.assert(
      fc.property(pulpErrorBody(), (body) => {
        let result: string | null = null;
        expect(() => {
          result = pulpErrorDetailFromBody(body);
        }).not.toThrow();
        if (result !== null) {
          expect((result as string).length).toBeGreaterThan(0);
          expect((result as string).length).toBeLessThanOrEqual(500);
        }
      }),
      { examples: [[oversizedNestedBody]] }
    );
  });
});
