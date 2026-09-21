/**
 * Fuzz properties for lib/extract-rpm-package-content-id.ts
 * (extractRpmPackageContentId). Pinning properties only: never throws, and a
 * non-null result is always a non-empty string containing no "/".
 *
 * pulpHref() alone essentially never reaches the non-null branch -- it never
 * generates the "/content/rpm/packages/" shape this module matches on -- so
 * validRpmPackageHref below is added specifically to make that branch
 * reachable, alongside pulpHref() and fc.string() for broad never-throws
 * coverage.
 *
 * This tier only runs under `npm run fuzz` (see vitest.fuzz.config.ts); it is
 * excluded from `npm test`.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { extractRpmPackageContentId } from "@/lib/extract-rpm-package-content-id";
import { pulpHref } from "@/test/fuzz/arbitraries";

const packageId = fc.webSegment().filter((s) => s.length > 0);

const relativeRpmPackageHref = fc
  .tuple(packageId, fc.boolean())
  .map(([id, trailingSlash]) => `/pulp/api/v3/content/rpm/packages/${id}${trailingSlash ? "/" : ""}`);

const absoluteRpmPackageHref = fc
  .tuple(fc.webUrl(), packageId, fc.boolean())
  .map(([base, id, trailingSlash]) => {
    const url = new URL(base);
    url.pathname = `/pulp/api/v3/content/rpm/packages/${id}${trailingSlash ? "/" : ""}`;
    return url.toString();
  });

const whitespacePad = fc.constantFrom("", " ", "  ", "\t");

/** Valid rpm-package hrefs (relative or absolute, with or without a trailing slash or padding). */
const validRpmPackageHref = fc
  .tuple(fc.oneof(relativeRpmPackageHref, absoluteRpmPackageHref), whitespacePad, whitespacePad)
  .map(([href, leading, trailing]) => `${leading}${href}${trailing}`);

const hrefLike = fc.oneof(
  { weight: 3, arbitrary: validRpmPackageHref },
  { weight: 2, arbitrary: pulpHref() },
  { weight: 2, arbitrary: fc.string() },
  { weight: 1, arbitrary: fc.constant(null) },
  { weight: 1, arbitrary: fc.constant(undefined) }
);

describe("extractRpmPackageContentId", () => {
  it("never throws for any string, null or undefined", () => {
    fc.assert(
      fc.property(hrefLike, (href) => {
        expect(() => extractRpmPackageContentId(href)).not.toThrow();
      })
    );
  });

  it("a non-null result is always a non-empty string with no slash", () => {
    fc.assert(
      fc.property(hrefLike, (href) => {
        const result = extractRpmPackageContentId(href);
        if (result !== null) {
          expect(result.length).toBeGreaterThan(0);
          expect(result).not.toContain("/");
        }
      })
    );
  });
});
