import { describe, expect, it } from "vitest";

import {
  isRepositoryVersionInstancePath,
  mapPulpRepositoryVersion,
} from "@/app/api/pulp/repositories/repository-version-map";

describe("mapPulpRepositoryVersion", () => {
  it("maps a full row", () => {
    const row = {
      pulp_href: "/pulp/api/v3/repositories/rpm/rpm/abc/versions/3/",
      pulp_created: "2024-01-01T00:00:00Z",
      number: 3,
      repository: "/pulp/api/v3/repositories/rpm/rpm/abc/",
      base_version: "/pulp/api/v3/repositories/rpm/rpm/abc/versions/2/",
      content_summary: {
        added: { "rpm.package": { count: 5, href: "/pulp/api/v3/content/rpm/packages/?x=y" } },
        removed: {},
        present: { "rpm.package": { count: 42, href: "/pulp/api/v3/content/rpm/packages/?x=y" } },
      },
    };

    expect(mapPulpRepositoryVersion(row)).toEqual({
      pulp_href: "/pulp/api/v3/repositories/rpm/rpm/abc/versions/3/",
      pulp_created: "2024-01-01T00:00:00Z",
      number: 3,
      repository: "/pulp/api/v3/repositories/rpm/rpm/abc/",
      base_version: "/pulp/api/v3/repositories/rpm/rpm/abc/versions/2/",
      content_summary: {
        added: { "rpm.package": { count: 5, href: "/pulp/api/v3/content/rpm/packages/?x=y" } },
        removed: {},
        present: { "rpm.package": { count: 42, href: "/pulp/api/v3/content/rpm/packages/?x=y" } },
      },
    });
  });

  it("falls back to empty/zero values for missing or mistyped fields", () => {
    expect(mapPulpRepositoryVersion({})).toEqual({
      pulp_href: "",
      pulp_created: "",
      number: 0,
      repository: "",
      base_version: null,
      content_summary: { added: {}, removed: {}, present: {} },
    });
  });

  it("treats a non-string, non-null base_version as null", () => {
    expect(mapPulpRepositoryVersion({ base_version: 123 }).base_version).toBeNull();
    expect(mapPulpRepositoryVersion({ base_version: null }).base_version).toBeNull();
    expect(mapPulpRepositoryVersion({ base_version: "/versions/1/" }).base_version).toBe(
      "/versions/1/"
    );
  });

  it("falls back to an empty content summary for a non-object content_summary", () => {
    expect(mapPulpRepositoryVersion({ content_summary: null }).content_summary).toEqual({
      added: {},
      removed: {},
      present: {},
    });
    expect(mapPulpRepositoryVersion({ content_summary: "oops" }).content_summary).toEqual({
      added: {},
      removed: {},
      present: {},
    });
  });

  it("skips a bucket entry that is not an object, and defaults count/href within one that is", () => {
    const row = {
      content_summary: {
        added: { "rpm.package": { count: 5, href: "/x/" }, "rpm.advisory": "not an object" },
        removed: { "rpm.package": {} },
      },
    };
    expect(mapPulpRepositoryVersion(row).content_summary).toEqual({
      added: { "rpm.package": { count: 5, href: "/x/" } },
      removed: { "rpm.package": { count: 0, href: "" } },
      present: {},
    });
  });
});

describe("isRepositoryVersionInstancePath", () => {
  const repositoryPath = "/pulp/api/v3/repositories/rpm/rpm/";

  it("matches a version instance path, with or without a trailing slash", () => {
    expect(isRepositoryVersionInstancePath(`${repositoryPath}abc/versions/3/`, repositoryPath)).toBe(
      true
    );
    expect(isRepositoryVersionInstancePath(`${repositoryPath}abc/versions/3`, repositoryPath)).toBe(
      true
    );
  });

  it("rejects a path outside the given repository", () => {
    expect(
      isRepositoryVersionInstancePath("/pulp/api/v3/repositories/deb/apt/abc/versions/3/", repositoryPath)
    ).toBe(false);
  });

  it("rejects a path with extra segments after the version number", () => {
    expect(
      isRepositoryVersionInstancePath(`${repositoryPath}abc/versions/3/content/`, repositoryPath)
    ).toBe(false);
  });

  it("rejects a non-numeric version segment", () => {
    expect(isRepositoryVersionInstancePath(`${repositoryPath}abc/versions/latest/`, repositoryPath)).toBe(
      false
    );
  });

  it("rejects the repository's own list/detail path", () => {
    expect(isRepositoryVersionInstancePath(repositoryPath, repositoryPath)).toBe(false);
    expect(isRepositoryVersionInstancePath(`${repositoryPath}abc/`, repositoryPath)).toBe(false);
  });
});
