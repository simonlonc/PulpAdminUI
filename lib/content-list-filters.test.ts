import { describe, expect, it } from "vitest";

import {
  DEFAULT_PULP_CONTENT_FILTERS,
  applyPulpContentFilters,
  contentSummaryLink,
  describeContentVersionScope,
  parsePulpContentFilters,
  parseRepositoryVersionHref,
  pulpContentFiltersToUrlParams,
  type PulpContentFilters,
} from "@/lib/content-list-filters";

const ALL_SET: PulpContentFilters = {
  repositoryVersion: "/pulp/api/v3/repositories/rpm/rpm/abc/versions/3/",
  repositoryVersionAdded: "/pulp/api/v3/repositories/rpm/rpm/abc/versions/2/",
  repositoryVersionRemoved: "/pulp/api/v3/repositories/rpm/rpm/abc/versions/1/",
  pulpType: "rpm.package",
};

describe("applyPulpContentFilters", () => {
  it("sets nothing for the default filters", () => {
    const params = new URLSearchParams();
    applyPulpContentFilters(params, DEFAULT_PULP_CONTENT_FILTERS);
    expect([...params]).toEqual([]);
  });

  it("sets each filter under its Pulp param name", () => {
    const params = new URLSearchParams();
    applyPulpContentFilters(params, ALL_SET);
    expect(params.get("repository_version")).toBe(ALL_SET.repositoryVersion);
    expect(params.get("repository_version_added")).toBe(ALL_SET.repositoryVersionAdded);
    expect(params.get("repository_version_removed")).toBe(ALL_SET.repositoryVersionRemoved);
    expect(params.get("pulp_type")).toBe("rpm.package");
  });

  it("leaves params it does not own untouched", () => {
    const params = new URLSearchParams({ limit: "50" });
    applyPulpContentFilters(params, DEFAULT_PULP_CONTENT_FILTERS);
    expect(params.get("limit")).toBe("50");
  });
});

describe("parsePulpContentFilters", () => {
  it("falls back to defaults for an empty query string", () => {
    expect(parsePulpContentFilters(new URLSearchParams())).toEqual(DEFAULT_PULP_CONTENT_FILTERS);
  });

  it("reads every field from the URL", () => {
    const params = new URLSearchParams({
      repository_version: ALL_SET.repositoryVersion,
      repository_version_added: ALL_SET.repositoryVersionAdded,
      repository_version_removed: ALL_SET.repositoryVersionRemoved,
      pulp_type: "rpm.package",
    });
    expect(parsePulpContentFilters(params)).toEqual(ALL_SET);
  });
});

describe("pulpContentFiltersToUrlParams", () => {
  it("maps the default filters to empty strings, which setExtraParams deletes", () => {
    expect(pulpContentFiltersToUrlParams(DEFAULT_PULP_CONTENT_FILTERS)).toEqual({
      repository_version: "",
      repository_version_added: "",
      repository_version_removed: "",
      pulp_type: "",
    });
  });

  it("keeps a field that differs from the default and empties the rest", () => {
    const filters: PulpContentFilters = { ...DEFAULT_PULP_CONTENT_FILTERS, pulpType: "rpm.package" };
    expect(pulpContentFiltersToUrlParams(filters)).toEqual({
      repository_version: "",
      repository_version_added: "",
      repository_version_removed: "",
      pulp_type: "rpm.package",
    });
  });

  it("round-trips through parsePulpContentFilters", () => {
    expect(
      parsePulpContentFilters(new URLSearchParams(pulpContentFiltersToUrlParams(ALL_SET)))
    ).toEqual(ALL_SET);
    expect(
      parsePulpContentFilters(
        new URLSearchParams(pulpContentFiltersToUrlParams(DEFAULT_PULP_CONTENT_FILTERS))
      )
    ).toEqual(DEFAULT_PULP_CONTENT_FILTERS);
  });
});

describe("parseRepositoryVersionHref", () => {
  it("splits a version href into repository href and version number", () => {
    expect(
      parseRepositoryVersionHref("/pulp/api/v3/repositories/rpm/rpm/abc-123/versions/12/")
    ).toEqual({
      repositoryHref: "/pulp/api/v3/repositories/rpm/rpm/abc-123/",
      versionNumber: 12,
    });
  });

  it("accepts version 0 and a missing trailing slash", () => {
    expect(parseRepositoryVersionHref("/repositories/file/file/u/versions/0")).toEqual({
      repositoryHref: "/repositories/file/file/u/",
      versionNumber: 0,
    });
  });

  it("returns null for anything that is not a version href", () => {
    expect(parseRepositoryVersionHref("")).toBeNull();
    expect(parseRepositoryVersionHref("/pulp/api/v3/repositories/rpm/rpm/abc/")).toBeNull();
    expect(parseRepositoryVersionHref("/pulp/api/v3/repositories/rpm/rpm/abc/versions/x/")).toBeNull();
    expect(parseRepositoryVersionHref("garbage")).toBeNull();
  });
});

describe("contentSummaryLink", () => {
  const href = "/pulp/api/v3/repositories/rpm/rpm/abc/versions/3/";

  it("puts the version href in the param chosen by the bucket", () => {
    const added = new URLSearchParams(contentSummaryLink(href, "added", "rpm.package").split("?")[1]);
    expect(added.get("repository_version_added")).toBe(href);
    expect(added.get("pulp_type")).toBe("rpm.package");
    expect(added.has("repository_version")).toBe(false);
    const removed = new URLSearchParams(contentSummaryLink(href, "removed", "rpm.package").split("?")[1]);
    expect(removed.get("repository_version_removed")).toBe(href);
    const present = new URLSearchParams(contentSummaryLink(href, "present", "rpm.package").split("?")[1]);
    expect(present.get("repository_version")).toBe(href);
    expect(present.has("repository_version_added")).toBe(false);
  });

  it("points at the content list", () => {
    expect(contentSummaryLink(href, "added", "x").startsWith("/content/list?")).toBe(true);
  });
});

describe("describeContentVersionScope", () => {
  const href = "/pulp/api/v3/repositories/rpm/rpm/abc/versions/3/";
  const none = DEFAULT_PULP_CONTENT_FILTERS;

  it("is null without a version scope", () => {
    expect(describeContentVersionScope({ ...none, pulpType: "rpm.package" }, null)).toBeNull();
  });

  it("names the repository, version and content type", () => {
    expect(
      describeContentVersionScope(
        { ...none, repositoryVersionAdded: href, pulpType: "rpm.package" },
        "my-repo"
      )
    ).toBe("Content added in my-repo version 3 (rpm.package)");
    expect(describeContentVersionScope({ ...none, repositoryVersionRemoved: href }, "r")).toBe(
      "Content removed in r version 3"
    );
    expect(describeContentVersionScope({ ...none, repositoryVersion: href }, "r")).toBe(
      "Content present in r version 3"
    );
  });

  it("falls back to the raw href when the repository is unknown", () => {
    expect(describeContentVersionScope({ ...none, repositoryVersion: href }, null)).toBe(
      `Content present in ${href}`
    );
  });
});
