import { afterEach, describe, expect, it, vi } from "vitest";

import { exportFileUrl, getExportHttpMapping } from "@/lib/export-http";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function captureLogLines() {
  vi.stubEnv("LOG_LEVEL", "info");
  const lines: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  return () => lines.map((line) => JSON.parse(line));
}

describe("getExportHttpMapping", () => {
  it("returns null, without a warning, when both variables are unset or blank", () => {
    const logged = captureLogLines();

    expect(getExportHttpMapping()).toBeNull();
    vi.stubEnv("PULP_EXPORT_HTTP_BASE_URL", "  ");
    vi.stubEnv("PULP_EXPORT_HTTP_PATH_PREFIX", "");
    expect(getExportHttpMapping()).toBeNull();

    expect(logged()).toEqual([]);
  });

  it("returns the trimmed mapping for a valid pair", () => {
    vi.stubEnv("PULP_EXPORT_HTTP_BASE_URL", " http://host.containers.internal:8099 ");
    vi.stubEnv("PULP_EXPORT_HTTP_PATH_PREFIX", " /var/lib/pulp/exports ");

    expect(getExportHttpMapping()).toEqual({
      baseUrl: "http://host.containers.internal:8099",
      pathPrefix: "/var/lib/pulp/exports",
    });
  });

  it("keeps the path of the base url and drops its trailing slash, query and hash", () => {
    vi.stubEnv("PULP_EXPORT_HTTP_BASE_URL", "https://files.example.com/pulp/exports/?a=1#top");
    vi.stubEnv("PULP_EXPORT_HTTP_PATH_PREFIX", "/var/lib/pulp/exports");

    expect(getExportHttpMapping()?.baseUrl).toBe("https://files.example.com/pulp/exports");
  });

  it.each([
    ["a malformed url", "not a url"],
    ["a non-http(s) scheme", "ftp://files.example.com"],
  ])("returns null and warns once for %s as the base url", (_label, value) => {
    const logged = captureLogLines();
    vi.stubEnv("PULP_EXPORT_HTTP_BASE_URL", value);
    vi.stubEnv("PULP_EXPORT_HTTP_PATH_PREFIX", "/var/lib/pulp/exports");

    expect(() => getExportHttpMapping()).not.toThrow();
    expect(getExportHttpMapping()).toBeNull();
    expect(getExportHttpMapping()).toBeNull();

    expect(logged()).toEqual([{ level: "warn", event: "export_http_base_url_invalid", value }]);
  });

  it("returns null and warns once for a path prefix that is not absolute", () => {
    const logged = captureLogLines();
    vi.stubEnv("PULP_EXPORT_HTTP_BASE_URL", "http://files.example.com");
    vi.stubEnv("PULP_EXPORT_HTTP_PATH_PREFIX", "relative/exports");

    expect(getExportHttpMapping()).toBeNull();
    expect(getExportHttpMapping()).toBeNull();

    expect(logged()).toEqual([
      { level: "warn", event: "export_http_path_prefix_invalid", value: "relative/exports" },
    ]);
  });

  it("warns about each invalid value when both are invalid", () => {
    const logged = captureLogLines();
    vi.stubEnv("PULP_EXPORT_HTTP_BASE_URL", "both-bad base");
    vi.stubEnv("PULP_EXPORT_HTTP_PATH_PREFIX", "both-bad-prefix");

    expect(getExportHttpMapping()).toBeNull();

    expect(logged().map((line) => line.event)).toEqual([
      "export_http_base_url_invalid",
      "export_http_path_prefix_invalid",
    ]);
  });

  it("warns once, naming the missing variable, when only the base url is set", () => {
    const logged = captureLogLines();
    vi.stubEnv("PULP_EXPORT_HTTP_BASE_URL", "http://only-base.example.com");

    expect(getExportHttpMapping()).toBeNull();
    expect(getExportHttpMapping()).toBeNull();

    expect(logged()).toEqual([
      {
        level: "warn",
        event: "export_http_incomplete",
        missing: "PULP_EXPORT_HTTP_PATH_PREFIX",
      },
    ]);
  });

  it("warns once, naming the missing variable, when only the path prefix is set", () => {
    const logged = captureLogLines();
    vi.stubEnv("PULP_EXPORT_HTTP_PATH_PREFIX", "/only/prefix");

    expect(getExportHttpMapping()).toBeNull();
    expect(getExportHttpMapping()).toBeNull();

    expect(logged()).toEqual([
      { level: "warn", event: "export_http_incomplete", missing: "PULP_EXPORT_HTTP_BASE_URL" },
    ]);
  });
});

describe("exportFileUrl", () => {
  const mapping = { baseUrl: "http://files.example.com:8099", pathPrefix: "/var/lib/pulp/exports" };

  it("maps a file under the prefix to the same relative path under the base url", () => {
    expect(exportFileUrl("/var/lib/pulp/exports/aa-probe/export-1.tar", mapping)).toBe(
      "http://files.example.com:8099/aa-probe/export-1.tar"
    );
    expect(exportFileUrl("/var/lib/pulp/exports/export-1-toc.json", mapping)).toBe(
      "http://files.example.com:8099/export-1-toc.json"
    );
  });

  it("never doubles a slash, whatever the trailing slashes on the base url and the prefix", () => {
    for (const baseUrl of ["http://f.test", "http://f.test/", "http://f.test//"]) {
      for (const pathPrefix of ["/var/lib/pulp/exports", "/var/lib/pulp/exports/"]) {
        expect(exportFileUrl("/var/lib/pulp/exports/a/b.tar", { baseUrl, pathPrefix })).toBe(
          "http://f.test/a/b.tar"
        );
      }
    }
  });

  it("keeps the path of a base url that serves the directory below its root", () => {
    expect(
      exportFileUrl("/var/lib/pulp/exports/a.tar", {
        baseUrl: "https://files.example.com/pulp/exports/",
        pathPrefix: "/var/lib/pulp/exports",
      })
    ).toBe("https://files.example.com/pulp/exports/a.tar");
  });

  it("returns null for a path that is not under the prefix", () => {
    expect(exportFileUrl("/var/lib/pulp/other/a.tar", mapping)).toBeNull();
    expect(exportFileUrl("/etc/passwd", mapping)).toBeNull();
    expect(exportFileUrl("a.tar", mapping)).toBeNull();
    expect(exportFileUrl("", mapping)).toBeNull();
  });

  it("does not treat a sibling directory that merely starts with the prefix as under it", () => {
    expect(exportFileUrl("/var/lib/pulp/exportsX/a.tar", mapping)).toBeNull();
    expect(exportFileUrl("/var/lib/pulp/exports-old/a.tar", mapping)).toBeNull();
  });

  it("returns null for the prefix itself or a directory with nothing below it", () => {
    expect(exportFileUrl("/var/lib/pulp/exports", mapping)).toBeNull();
    expect(exportFileUrl("/var/lib/pulp/exports/", mapping)).toBeNull();
    expect(exportFileUrl("/var/lib/pulp/exports//", mapping)).toBeNull();
  });

  it("returns null when any segment is . or ..", () => {
    expect(exportFileUrl("/var/lib/pulp/exports/../../../etc/passwd", mapping)).toBeNull();
    expect(exportFileUrl("/var/lib/pulp/exports/a/../b.tar", mapping)).toBeNull();
    expect(exportFileUrl("/var/lib/pulp/exports/./a.tar", mapping)).toBeNull();
    expect(exportFileUrl("/var/lib/pulp/exports/a/..", mapping)).toBeNull();
  });

  it("allows a segment that merely contains dots", () => {
    expect(exportFileUrl("/var/lib/pulp/exports/a../.hidden/..b.tar", mapping)).toBe(
      "http://files.example.com:8099/a../.hidden/..b.tar"
    );
  });

  it("percent-encodes each segment, so a name cannot add a query, a hash or a path step", () => {
    expect(exportFileUrl("/var/lib/pulp/exports/my dir/a?b#c%2e.tar", mapping)).toBe(
      "http://files.example.com:8099/my%20dir/a%3Fb%23c%252e.tar"
    );
  });

  it("ignores empty segments, as the filesystem does", () => {
    expect(exportFileUrl("/var/lib/pulp/exports//a//b.tar", mapping)).toBe(
      "http://files.example.com:8099/a/b.tar"
    );
  });

  it("serves every absolute path under a prefix of /", () => {
    expect(exportFileUrl("/a/b.tar", { baseUrl: "http://f.test", pathPrefix: "/" })).toBe(
      "http://f.test/a/b.tar"
    );
  });
});
