import { describe, expect, it } from "vitest";

import {
  DEFAULT_PULP_TASK_FILTERS,
  applyPulpTaskFilters,
  parsePulpTaskFilters,
  pulpTaskFiltersToUrlParams,
  type PulpTaskFilters,
} from "@/lib/task-list-filters";

describe("applyPulpTaskFilters", () => {
  it("sets nothing for the default filters", () => {
    const params = new URLSearchParams();
    applyPulpTaskFilters(params, DEFAULT_PULP_TASK_FILTERS);
    expect(params.has("state")).toBe(false);
    expect(params.has("started_at__gte")).toBe(false);
    expect(params.has("started_at__lte")).toBe(false);
  });

  it("sets state as-is", () => {
    const params = new URLSearchParams();
    applyPulpTaskFilters(params, { ...DEFAULT_PULP_TASK_FILTERS, state: "running" });
    expect(params.get("state")).toBe("running");
  });

  it("converts startedAfter to the start of the day in UTC", () => {
    const params = new URLSearchParams();
    applyPulpTaskFilters(params, { ...DEFAULT_PULP_TASK_FILTERS, startedAfter: "2024-05-01" });
    expect(params.get("started_at__gte")).toBe("2024-05-01T00:00:00.000Z");
  });

  it("converts startedBefore to the end of the day in UTC", () => {
    const params = new URLSearchParams();
    applyPulpTaskFilters(params, { ...DEFAULT_PULP_TASK_FILTERS, startedBefore: "2024-05-01" });
    expect(params.get("started_at__lte")).toBe("2024-05-01T23:59:59.999Z");
  });

  it("leaves params it does not own untouched", () => {
    const params = new URLSearchParams({ limit: "100" });
    applyPulpTaskFilters(params, DEFAULT_PULP_TASK_FILTERS);
    expect(params.get("limit")).toBe("100");
  });
});

describe("parsePulpTaskFilters", () => {
  it("falls back to defaults for an empty query string", () => {
    expect(parsePulpTaskFilters(new URLSearchParams())).toEqual(DEFAULT_PULP_TASK_FILTERS);
  });

  it("reads every field from the URL", () => {
    const params = new URLSearchParams({
      state: "failed",
      started_after: "2024-01-01",
      started_before: "2024-01-31",
    });
    expect(parsePulpTaskFilters(params)).toEqual({
      state: "failed",
      startedAfter: "2024-01-01",
      startedBefore: "2024-01-31",
    });
  });
});

describe("pulpTaskFiltersToUrlParams", () => {
  it("maps the default filters to empty strings, which setExtraParams deletes", () => {
    expect(pulpTaskFiltersToUrlParams(DEFAULT_PULP_TASK_FILTERS)).toEqual({
      state: "",
      started_after: "",
      started_before: "",
    });
  });

  it("keeps a field that differs from the default and empties the rest", () => {
    const filters: PulpTaskFilters = { ...DEFAULT_PULP_TASK_FILTERS, state: "running" };
    expect(pulpTaskFiltersToUrlParams(filters)).toEqual({
      state: "running",
      started_after: "",
      started_before: "",
    });
  });

  it("sets every field when every field differs from the default", () => {
    const filters: PulpTaskFilters = {
      state: "completed",
      startedAfter: "2024-01-01",
      startedBefore: "2024-01-31",
    };
    expect(pulpTaskFiltersToUrlParams(filters)).toEqual({
      state: "completed",
      started_after: "2024-01-01",
      started_before: "2024-01-31",
    });
  });

  it("round-trips through parsePulpTaskFilters", () => {
    const filters: PulpTaskFilters = {
      state: "completed",
      startedAfter: "2024-01-01",
      startedBefore: "2024-01-31",
    };
    const roundTripped = parsePulpTaskFilters(
      new URLSearchParams(pulpTaskFiltersToUrlParams(filters))
    );
    expect(roundTripped).toEqual(filters);
  });

  it("round-trips the default filters", () => {
    const roundTripped = parsePulpTaskFilters(
      new URLSearchParams(pulpTaskFiltersToUrlParams(DEFAULT_PULP_TASK_FILTERS))
    );
    expect(roundTripped).toEqual(DEFAULT_PULP_TASK_FILTERS);
  });
});
