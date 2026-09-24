import { describe, expect, it } from "vitest";

import {
  DEFAULT_PULP_LIST_QUERY,
  applyPulpListFilters,
  buildPulpListParams,
  parsePulpListQuery,
  pulpListQueryToUrlParams,
  type PulpListQuery,
} from "@/lib/pulp-list-query";

describe("buildPulpListParams", () => {
  it("serializes the default query to just limit and offset", () => {
    const params = buildPulpListParams(DEFAULT_PULP_LIST_QUERY);
    expect(params.get("limit")).toBe("100");
    expect(params.get("offset")).toBe("0");
    expect(params.has("ordering")).toBe(false);
    expect(params.has("name__icontains")).toBe(false);
    expect(params.has("pulp_label_select")).toBe(false);
    expect(params.has("q")).toBe(false);
  });

  it("computes offset from page and pageSize", () => {
    const query: PulpListQuery = { ...DEFAULT_PULP_LIST_QUERY, page: 3, pageSize: 25 };
    const params = buildPulpListParams(query);
    expect(params.get("limit")).toBe("25");
    expect(params.get("offset")).toBe("50");
  });

  it("emits a digit-string offset for a page parsed from a huge URL value (F-5)", () => {
    // Repro: ?page=41091115912422540000 previously produced
    // offset=4.1091115912422537e+21 -- exponential notation, not a digit string.
    const query = parsePulpListQuery(new URLSearchParams({ page: "41091115912422540000" }));
    const params = buildPulpListParams(query);
    expect(params.get("offset")).toMatch(/^\d+$/);
  });

  it("sends search as name__icontains by default", () => {
    const query: PulpListQuery = { ...DEFAULT_PULP_LIST_QUERY, search: "epel" };
    const params = buildPulpListParams(query);
    expect(params.get("name__icontains")).toBe("epel");
  });

  it("uses a custom search field and lookup when given", () => {
    const query: PulpListQuery = { ...DEFAULT_PULP_LIST_QUERY, search: "admin" };
    const params = buildPulpListParams(query, { searchField: "username", searchLookup: "exact" });
    expect(params.get("username__exact")).toBe("admin");
    expect(params.has("name__icontains")).toBe(false);
  });

  it("sets ordering, label select and q when present", () => {
    const query: PulpListQuery = {
      ...DEFAULT_PULP_LIST_QUERY,
      ordering: "-pulp_created",
      labelSelect: "env=prod",
      q: "name=rpm",
    };
    const params = buildPulpListParams(query);
    expect(params.get("ordering")).toBe("-pulp_created");
    expect(params.get("pulp_label_select")).toBe("env=prod");
    expect(params.get("q")).toBe("name=rpm");
  });
});

describe("parsePulpListQuery", () => {
  it("falls back to defaults for an empty query string", () => {
    expect(parsePulpListQuery(new URLSearchParams())).toEqual(DEFAULT_PULP_LIST_QUERY);
  });

  it("reads every field from the URL", () => {
    const params = new URLSearchParams({
      search: "epel",
      ordering: "name",
      page: "2",
      size: "50",
      label: "env=prod",
      q: "name=rpm",
    });
    expect(parsePulpListQuery(params)).toEqual({
      search: "epel",
      ordering: "name",
      page: 2,
      pageSize: 50,
      labelSelect: "env=prod",
      q: "name=rpm",
    });
  });

  it("falls back to the default page for non-numeric or out-of-range page values", () => {
    expect(parsePulpListQuery(new URLSearchParams({ page: "abc" })).page).toBe(1);
    expect(parsePulpListQuery(new URLSearchParams({ page: "0" })).page).toBe(1);
    expect(parsePulpListQuery(new URLSearchParams({ page: "-5" })).page).toBe(1);
  });

  it("accepts a leading-integer page value the same way Number.parseInt does", () => {
    expect(parsePulpListQuery(new URLSearchParams({ page: "3abc" })).page).toBe(3);
  });

  it("clamps a page beyond Number.MAX_SAFE_INTEGER instead of losing precision (F-5)", () => {
    const query = parsePulpListQuery(new URLSearchParams({ page: "41091115912422540000" }));
    expect(Number.isSafeInteger(query.page)).toBe(true);
  });

  it("falls back to the default page size for a size outside the allowed set", () => {
    expect(parsePulpListQuery(new URLSearchParams({ size: "999" })).pageSize).toBe(100);
    expect(parsePulpListQuery(new URLSearchParams({ size: "0" })).pageSize).toBe(100);
    expect(parsePulpListQuery(new URLSearchParams({ size: "abc" })).pageSize).toBe(100);
  });

  it("accepts every allowed page size", () => {
    for (const size of [25, 50, 100, 200]) {
      expect(parsePulpListQuery(new URLSearchParams({ size: String(size) })).pageSize).toBe(size);
    }
  });
});

describe("applyPulpListFilters", () => {
  it("applies search, q and labelSelect in one call so all three survive in the resulting URL", () => {
    // Regression for the list-query-bar bug: three sequential single-key
    // setter calls each spread the same pre-submit query, so only the last
    // one's key survived. One applyPulpListFilters call must fold all three
    // changes into a single query, and that query must serialize to a
    // single query string containing all three params.
    const query: PulpListQuery = { ...DEFAULT_PULP_LIST_QUERY, page: 3 };
    const next = applyPulpListFilters(query, {
      search: "epel",
      q: "name=rpm",
      labelSelect: "env=prod",
    });
    const params = pulpListQueryToUrlParams(next);
    expect(params.get("search")).toBe("epel");
    expect(params.get("q")).toBe("name=rpm");
    expect(params.get("label")).toBe("env=prod");
  });

  it("resets page to the default when a filter changes", () => {
    const query: PulpListQuery = { ...DEFAULT_PULP_LIST_QUERY, page: 5 };
    const next = applyPulpListFilters(query, { search: "epel" });
    expect(next.page).toBe(DEFAULT_PULP_LIST_QUERY.page);
  });

  it("leaves other filters, ordering and pageSize intact when only one key is patched", () => {
    const query: PulpListQuery = {
      ...DEFAULT_PULP_LIST_QUERY,
      ordering: "-pulp_created",
      pageSize: 200,
      labelSelect: "env=prod",
      q: "name=rpm",
    };
    const next = applyPulpListFilters(query, { search: "epel" });
    expect(next).toEqual({
      ...query,
      search: "epel",
      page: DEFAULT_PULP_LIST_QUERY.page,
    });
  });
});

describe("pulpListQueryToUrlParams", () => {
  it("produces an empty query string for the default query", () => {
    expect(pulpListQueryToUrlParams(DEFAULT_PULP_LIST_QUERY).toString()).toBe("");
  });

  it("only sets params that differ from the default", () => {
    const query: PulpListQuery = { ...DEFAULT_PULP_LIST_QUERY, page: 2 };
    const params = pulpListQueryToUrlParams(query);
    expect(params.get("page")).toBe("2");
    expect(params.has("search")).toBe(false);
    expect(params.has("size")).toBe(false);
  });

  it("sets every field when every field differs from the default", () => {
    const query: PulpListQuery = {
      search: "epel",
      ordering: "-name",
      page: 3,
      pageSize: 200,
      labelSelect: "env=prod",
      q: "name=rpm",
    };
    const params = pulpListQueryToUrlParams(query);
    expect(Object.fromEntries(params.entries())).toEqual({
      search: "epel",
      ordering: "-name",
      page: "3",
      size: "200",
      label: "env=prod",
      q: "name=rpm",
    });
  });

  it("round-trips through parsePulpListQuery", () => {
    const query: PulpListQuery = {
      search: "epel",
      ordering: "-name",
      page: 3,
      pageSize: 200,
      labelSelect: "env=prod",
      q: "name=rpm",
    };
    const roundTripped = parsePulpListQuery(pulpListQueryToUrlParams(query));
    expect(roundTripped).toEqual(query);
  });

  it("round-trips the default query", () => {
    const roundTripped = parsePulpListQuery(pulpListQueryToUrlParams(DEFAULT_PULP_LIST_QUERY));
    expect(roundTripped).toEqual(DEFAULT_PULP_LIST_QUERY);
  });
});
