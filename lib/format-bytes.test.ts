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

  it("returns a dash for a negative number instead of 'NaN undefined' (F-4)", () => {
    expect(formatBytes(-1024)).toBe("-");
  });

  it("returns a dash for a value between 0 and 1, which has no representable unit (F-4)", () => {
    // Counterexamples from the fuzz run: Math.log of a fraction is negative, so the
    // exponent indexes the fixed `units` array out of bounds and renders "undefined".
    expect(formatBytes(0.5)).toBe("-");
    expect(formatBytes(0.001)).toBe("-");
    expect(formatBytes(5e-324)).toBe("-");
  });

  it("returns a dash for non-finite input instead of 'Infinity TB' (F-4)", () => {
    expect(formatBytes(Infinity)).toBe("-");
    expect(formatBytes(-Infinity)).toBe("-");
  });

  it("returns a dash instead of exponential notation for an astronomically large value (F-4)", () => {
    // toFixed() itself switches to exponential notation for a magnitude >= 1e21, and
    // dividing an enormous byte count by 1024**4 (TB) can still land above that threshold.
    expect(formatBytes(2e33)).toBe("-");
    expect(formatBytes(1e300)).toBe("-");
  });
});
