import { describe, expect, it } from "vitest";

import { formatBytes } from "@/lib/format-bytes";

describe("formatBytes", () => {
  it("formats zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats sub-kilobyte values with no decimals", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats kilobytes and above with two decimals", () => {
    expect(formatBytes(1024)).toBe("1.00 KB");
    expect(formatBytes(1536)).toBe("1.50 KB");
  });

  it("caps the unit at TB instead of going to PB", () => {
    expect(formatBytes(1024 ** 5)).toBe("1024.00 TB");
  });

  it("returns a dash for non-numeric or NaN input", () => {
    expect(formatBytes(null)).toBe("-");
    expect(formatBytes(undefined)).toBe("-");
    expect(formatBytes("1024")).toBe("-");
    expect(formatBytes(Number.NaN)).toBe("-");
  });

  it("does not handle negative numbers gracefully (suspected bug)", () => {
    // Math.log of a negative number is NaN, so both the exponent and the formatted
    // value become NaN, and units[NaN] is undefined.
    expect(formatBytes(-1024)).toBe("NaN undefined");
  });
});
