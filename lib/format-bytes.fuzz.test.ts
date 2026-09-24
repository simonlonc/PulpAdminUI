/**
 * Fuzz properties for lib/format-bytes.ts (formatBytes). Pins F-4: for a
 * range of small/negative numeric inputs, formatBytes renders the literal
 * words "undefined", "NaN" or "Infinity" into the returned string instead of
 * a byte size, because a negative exponent indexes the fixed `units` array
 * out of bounds and/or Math.log of a non-positive value propagates NaN.
 *
 * This tier only runs under `npm run fuzz` (see vitest.fuzz.config.ts); it is
 * excluded from `npm test`.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { formatBytes } from "@/lib/format-bytes";

// Derived from the module's own behaviour on exact powers of 1024, rather than
// copying its internal `units` array (oracle hygiene rule 1).
const derivedUnits = Array.from({ length: 5 }, (_, exp) => {
  const [, unit] = formatBytes(1024 ** exp).split(" ");
  return unit;
});

const positiveShapePattern = new RegExp(`^-$|^\\d+(\\.\\d+)? (${derivedUnits.join("|")})$`);

describe("formatBytes", () => {
  it("F-4: never renders undefined, NaN or Infinity into the output", () => {
    // Counterexamples from the exploratory run: formatBytes(0.5) -> "512.00 undefined",
    // formatBytes(0.001) -> "1.02 undefined", formatBytes(5e-324) -> "Infinity undefined",
    // formatBytes(-1024) -> "NaN undefined". All four are fractional-or-negative inputs
    // whose Math.log-derived exponent lands outside the fixed units array.
    fc.assert(
      fc.property(fc.double(), (value) => {
        expect(formatBytes(value)).not.toMatch(/undefined|NaN|Infinity/);
      }),
      { examples: [[0.5], [0.001], [5e-324], [-1024]] }
    );
  });

  it("matches the expected shape for a finite, non-negative input", () => {
    // Same underlying defect as F-4, stated as the positive invariant: any finite
    // non-negative input should render as "<number> <unit>" (or "-"), never anything
    // else. Seeded with the same known-broken values so the failure is deterministic.
    fc.assert(
      fc.property(fc.double({ min: 0, noNaN: true, noDefaultInfinity: true }), (value) => {
        expect(formatBytes(value)).toMatch(positiveShapePattern);
      }),
      { examples: [[0.5], [0.001], [5e-324]] }
    );
  });
});
