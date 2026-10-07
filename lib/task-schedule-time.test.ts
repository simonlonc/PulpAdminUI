import { describe, expect, it } from "vitest";

import {
  formatNextDispatchCountdown,
  formatSpan,
  formatTaskDuration,
} from "@/lib/task-schedule-time";

const NOW = Date.parse("2024-01-01T00:00:00Z");

describe("formatSpan", () => {
  it("keeps the two largest non-zero units", () => {
    expect(formatSpan(45_000)).toBe("45s");
    expect(formatSpan((3 * 3600 + 12 * 60 + 5) * 1000)).toBe("3h 12m");
    expect(formatSpan((2 * 86400 + 4 * 3600) * 1000)).toBe("2d 4h");
  });

  it("renders zero as 0s", () => {
    expect(formatSpan(0)).toBe("0s");
    expect(formatSpan(400)).toBe("0s");
  });
});

describe("formatNextDispatchCountdown", () => {
  it("counts down to a future dispatch", () => {
    expect(formatNextDispatchCountdown("2024-01-01T03:12:30Z", NOW)).toBe("in 3h 12m");
  });

  it("flags a past dispatch as overdue", () => {
    expect(formatNextDispatchCountdown("2023-12-31T23:55:00Z", NOW)).toBe("overdue by 5m");
  });

  it("returns an empty string for missing or invalid input", () => {
    expect(formatNextDispatchCountdown(null, NOW)).toBe("");
    expect(formatNextDispatchCountdown("nope", NOW)).toBe("");
  });
});

describe("formatTaskDuration", () => {
  it("subtracts started_at from finished_at", () => {
    expect(formatTaskDuration("2024-01-01T00:00:00Z", "2024-01-01T00:01:30Z")).toBe("1m 30s");
  });

  it("returns null when a bound is missing, invalid or reversed", () => {
    expect(formatTaskDuration(null, "2024-01-01T00:01:30Z")).toBeNull();
    expect(formatTaskDuration("2024-01-01T00:00:00Z", null)).toBeNull();
    expect(formatTaskDuration("bad", "2024-01-01T00:01:30Z")).toBeNull();
    expect(formatTaskDuration("2024-01-01T00:01:30Z", "2024-01-01T00:00:00Z")).toBeNull();
  });
});
