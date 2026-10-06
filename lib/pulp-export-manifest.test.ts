import { describe, expect, it } from "vitest";

import {
  exportChecksumAlgorithm,
  exportFileBasename,
  exportManifestEntries,
  exportParamsSummary,
} from "@/lib/pulp-export-manifest";

const SHA256 = "c8e8a7ff309aff3d5a23c97ea623cb95de7c362ee59d3aa00b7d65b750632f55";

describe("exportChecksumAlgorithm", () => {
  it("names 64 hex characters sha256", () => {
    expect(exportChecksumAlgorithm(SHA256)).toBe("sha256");
  });

  it("names 8 hex characters crc32", () => {
    expect(exportChecksumAlgorithm("2e1a1f6d")).toBe("crc32");
  });

  it("reads hex case-insensitively", () => {
    expect(exportChecksumAlgorithm(SHA256.toUpperCase())).toBe("sha256");
    expect(exportChecksumAlgorithm("2E1A1F6D")).toBe("crc32");
  });

  it("falls back to a plain checksum for any other length or non-hex text", () => {
    expect(exportChecksumAlgorithm("")).toBe("checksum");
    expect(exportChecksumAlgorithm("2e1a1f6")).toBe("checksum");
    expect(exportChecksumAlgorithm("a".repeat(40))).toBe("checksum");
    expect(exportChecksumAlgorithm("g".repeat(64))).toBe("checksum");
    expect(exportChecksumAlgorithm("zzzzzzzz")).toBe("checksum");
  });
});

describe("exportFileBasename", () => {
  it("returns the last path segment", () => {
    expect(exportFileBasename("/var/lib/pulp/exports/a/export-1.tar")).toBe("export-1.tar");
  });

  it("returns a bare name unchanged and ignores a trailing slash", () => {
    expect(exportFileBasename("export-1.tar")).toBe("export-1.tar");
    expect(exportFileBasename("/var/lib/pulp/exports/a/")).toBe("a");
  });
});

describe("exportManifestEntries", () => {
  const tar = "/var/lib/pulp/exports/a/export-1.tar";
  const toc = "/var/lib/pulp/exports/a/export-1-toc.json";

  it("labels each entry by its own digest and marks only the toc file", () => {
    const entries = exportManifestEntries({
      output_file_info: { [tar]: "2e1a1f6d", [toc]: SHA256 },
      toc_info: { file: toc, sha256: SHA256, meta: {} },
    });

    expect(entries).toEqual([
      { path: tar, basename: "export-1.tar", checksum: "2e1a1f6d", algorithm: "crc32", isToc: false },
      { path: toc, basename: "export-1-toc.json", checksum: SHA256, algorithm: "sha256", isToc: true },
    ]);
  });

  it("marks nothing as the toc when toc_info names no file, and tolerates a null manifest", () => {
    expect(
      exportManifestEntries({ output_file_info: { [tar]: "2e1a1f6d" }, toc_info: {} })[0].isToc
    ).toBe(false);
    expect(
      exportManifestEntries({
        output_file_info: null as unknown as Record<string, string>,
        toc_info: {},
      })
    ).toEqual([]);
  });
});

describe("exportParamsSummary", () => {
  it("summarises full, dry_run and chunk_size when present", () => {
    expect(exportParamsSummary({ full: true, dry_run: true, chunk_size: "500MB" })).toBe(
      "full, dry run, chunk size 500MB"
    );
    expect(exportParamsSummary({ full: false })).toBe("incremental");
  });

  it("is empty when none of them is present", () => {
    expect(exportParamsSummary({})).toBe("");
    expect(exportParamsSummary(null)).toBe("");
    expect(exportParamsSummary({ full: true, dry_run: false, chunk_size: "" })).toBe("full");
  });
});
