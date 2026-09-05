import { describe, expect, it } from "vitest";

import { extractRpmPackageContentId } from "@/lib/extract-rpm-package-content-id";

describe("extractRpmPackageContentId", () => {
  it("extracts the id from a relative href", () => {
    expect(extractRpmPackageContentId("/pulp/api/v3/content/rpm/packages/abc-123/")).toBe("abc-123");
  });

  it("extracts the id from a relative href with no trailing slash", () => {
    expect(extractRpmPackageContentId("/pulp/api/v3/content/rpm/packages/abc-123")).toBe("abc-123");
  });

  it("extracts the id from a full URL", () => {
    expect(
      extractRpmPackageContentId("https://host/pulp/api/v3/content/rpm/packages/abc-123/")
    ).toBe("abc-123");
  });

  it("trims surrounding whitespace before matching", () => {
    expect(extractRpmPackageContentId("  /pulp/api/v3/content/rpm/packages/xyz/  ")).toBe("xyz");
  });

  it("returns null for null, undefined and blank input", () => {
    expect(extractRpmPackageContentId(null)).toBeNull();
    expect(extractRpmPackageContentId(undefined)).toBeNull();
    expect(extractRpmPackageContentId("")).toBeNull();
    expect(extractRpmPackageContentId("   ")).toBeNull();
  });

  it("returns null for a path that is not an rpm package content href", () => {
    expect(extractRpmPackageContentId("/pulp/api/v3/content/rpm/advisories/abc-123/")).toBeNull();
  });

  it("returns null for a malformed absolute-looking URL", () => {
    expect(extractRpmPackageContentId("http://")).toBeNull();
  });
});
