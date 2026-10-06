// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RepositoryVersionSummary } from "@/components/pulp/repository-version-summary";
import type { PulpRepositoryVersion } from "@/services/pulp/types";

afterEach(() => {
  cleanup();
});

const VERSION_HREF = "/pulp/api/v3/repositories/rpm/rpm/abc/versions/3/";

function makeVersion(): PulpRepositoryVersion {
  return {
    pulp_href: VERSION_HREF,
    content_summary: {
      added: { "rpm.package": { count: 4, href: "/pulp/api/v3/content/rpm/packages/?x=1" } },
      removed: { "rpm.advisory": { count: 0, href: "/pulp/api/v3/content/rpm/advisories/?x=1" } },
      present: {},
    },
  } as unknown as PulpRepositoryVersion;
}

describe("RepositoryVersionSummary", () => {
  it("links a non-empty entry to the content list scoped by its bucket", () => {
    render(<RepositoryVersionSummary version={makeVersion()} />);
    const link = screen.getByRole("link", { name: "4" });
    const url = new URL(link.getAttribute("href") ?? "", "http://localhost");
    expect(url.pathname).toBe("/content/list");
    expect(url.searchParams.get("repository_version_added")).toBe(VERSION_HREF);
    expect(url.searchParams.get("pulp_type")).toBe("rpm.package");
  });

  it("renders a count of 0 as plain text", () => {
    render(<RepositoryVersionSummary version={makeVersion()} />);
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "0" })).toBeNull();
  });
});
