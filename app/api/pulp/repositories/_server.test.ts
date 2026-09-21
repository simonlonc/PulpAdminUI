import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildUpstreamListParams,
  extractNextApiPath,
  normalizePulpHrefToApiPath,
  toPulpHrefPath,
} from "@/app/api/pulp/repositories/_server";

describe("buildUpstreamListParams", () => {
  it("defaults limit and offset when absent", () => {
    const params = buildUpstreamListParams(new URLSearchParams());
    expect(params.get("limit")).toBe("200");
    expect(params.get("offset")).toBe("0");
  });

  it("forwards limit and offset when present", () => {
    const params = buildUpstreamListParams(new URLSearchParams({ limit: "10", offset: "20" }));
    expect(params.get("limit")).toBe("10");
    expect(params.get("offset")).toBe("20");
  });

  it("forwards every allowlisted list param", () => {
    const params = buildUpstreamListParams(
      new URLSearchParams({
        ordering: "-pulp_created",
        name__icontains: "epel",
        pulp_label_select: "env=prod",
        q: "name=rpm",
      })
    );
    expect(params.get("ordering")).toBe("-pulp_created");
    expect(params.get("name__icontains")).toBe("epel");
    expect(params.get("pulp_label_select")).toBe("env=prod");
    expect(params.get("q")).toBe("name=rpm");
  });

  it("falls back to the default limit/offset when their values are not non-negative integers (F-6)", () => {
    // Repro: ?limit=abc&offset=../../x previously forwarded both values unchanged.
    const params = buildUpstreamListParams(new URLSearchParams({ limit: "abc", offset: "../../x" }));
    expect(params.get("limit")).toBe("200");
    expect(params.get("offset")).toBe("0");
  });

  it("drops a param that is not on the allowlist instead of forwarding it", () => {
    const params = buildUpstreamListParams(new URLSearchParams({ arbitrary_field: "1" }));
    expect(params.has("arbitrary_field")).toBe(false);
    expect([...params.keys()]).toEqual(["limit", "offset"]);
  });

  it("forwards an extra allowed param only when passed in for that call", () => {
    const withoutExtra = buildUpstreamListParams(new URLSearchParams({ state: "failed" }));
    expect(withoutExtra.has("state")).toBe(false);

    const withExtra = buildUpstreamListParams(new URLSearchParams({ state: "failed" }), ["state"]);
    expect(withExtra.get("state")).toBe("failed");
  });
});

describe("with PULP_BASE_URL stubbed", () => {
  beforeEach(() => {
    vi.stubEnv("PULP_BASE_URL", "http://localhost:8080/pulp/api/v3");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("normalizePulpHrefToApiPath", () => {
    it("strips the Pulp base path from a full URL", () => {
      expect(
        normalizePulpHrefToApiPath("http://localhost:8080/pulp/api/v3/repositories/rpm/rpm/abc/")
      ).toBe("/repositories/rpm/rpm/abc/");
    });

    it("strips the Pulp base path regardless of the URL's host", () => {
      expect(
        normalizePulpHrefToApiPath("https://other-host:1234/pulp/api/v3/repositories/y/")
      ).toBe("/repositories/y/");
    });

    it("leaves a relative path already stripped of the base path unchanged", () => {
      expect(normalizePulpHrefToApiPath("/repositories/rpm/rpm/abc/")).toBe(
        "/repositories/rpm/rpm/abc/"
      );
    });

    it("adds a leading slash to a relative path missing one before comparing", () => {
      expect(normalizePulpHrefToApiPath("pulp/api/v3/repositories/x/")).toBe("/repositories/x/");
    });

    it("leaves a path with a different prefix unchanged", () => {
      expect(normalizePulpHrefToApiPath("/other/api/x/")).toBe("/other/api/x/");
    });

    it("returns a single slash for the bare base path", () => {
      expect(normalizePulpHrefToApiPath("/pulp/api/v3")).toBe("/");
    });

    it("resolves parent-directory segments in a relative href before the base path check", () => {
      expect(
        normalizePulpHrefToApiPath("/repositories/../../../../pulp/api/v3/status/")
      ).toBe("/status/");
    });

    it("keeps the query string when normalizing a relative path", () => {
      expect(normalizePulpHrefToApiPath("/repositories/x/?limit=1&offset=0")).toBe(
        "/repositories/x/?limit=1&offset=0"
      );
    });

    it("resolves dot segments in an absolute http(s) URL", () => {
      expect(
        normalizePulpHrefToApiPath("http://localhost:8080/pulp/api/v3/repositories/rpm/rpm/../../x/")
      ).toBe("/repositories/x/");
    });

    it("F-1: never throws for an absolute href with a malformed authority", () => {
      expect(() => normalizePulpHrefToApiPath("http://h:8080;/repositories/")).not.toThrow();
      expect(() => normalizePulpHrefToApiPath("http://[/repositories/")).not.toThrow();
      expect(() => normalizePulpHrefToApiPath("https://%%/repositories/")).not.toThrow();
    });
  });

  describe("toPulpHrefPath", () => {
    it("leaves a path already carrying the base path unchanged", () => {
      expect(toPulpHrefPath("/pulp/api/v3/repositories/x/")).toBe("/pulp/api/v3/repositories/x/");
    });

    it("prefixes a relative path with the base path", () => {
      expect(toPulpHrefPath("/repositories/x/")).toBe("/pulp/api/v3/repositories/x/");
      expect(toPulpHrefPath("repositories/x/")).toBe("/pulp/api/v3/repositories/x/");
    });

    it("reduces a full URL to the base-prefixed path", () => {
      expect(toPulpHrefPath("http://localhost:8080/pulp/api/v3/repositories/x/")).toBe(
        "/pulp/api/v3/repositories/x/"
      );
    });

    it("F-1: never throws for an absolute href with a malformed authority", () => {
      expect(() => toPulpHrefPath("http://h:8080;/repositories/")).not.toThrow();
      expect(() => toPulpHrefPath("http://[/repositories/")).not.toThrow();
      expect(() => toPulpHrefPath("https://%%/repositories/")).not.toThrow();
    });
  });

  describe("extractNextApiPath", () => {
    it("returns null for a null next value", () => {
      expect(extractNextApiPath(null)).toBeNull();
    });

    it("strips the base path from a plain absolute next URL", () => {
      expect(
        extractNextApiPath("http://localhost:8080/pulp/api/v3/repositories/rpm/rpm/?offset=10&limit=10")
      ).toBe("/repositories/rpm/rpm/?offset=10&limit=10");
    });

    it("reads the URL out of an href=\"...\" wrapped value", () => {
      expect(
        extractNextApiPath('<a href="http://localhost:8080/pulp/api/v3/tasks/?offset=20">next</a>')
      ).toBe("/tasks/?offset=20");
    });

    it("handles a value that is already a relative path", () => {
      expect(extractNextApiPath("/pulp/api/v3/repositories/?offset=10")).toBe(
        "/repositories/?offset=10"
      );
    });

    it("F-1: never throws for an absolute href with a malformed authority", () => {
      expect(() => extractNextApiPath("http://h:8080;/repositories/")).not.toThrow();
      expect(() => extractNextApiPath("http://[/repositories/")).not.toThrow();
      expect(() => extractNextApiPath("https://%%/repositories/")).not.toThrow();
    });
  });
});
