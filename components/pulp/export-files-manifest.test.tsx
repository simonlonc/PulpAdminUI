// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ExportFilesManifest } from "@/components/pulp/export-files-manifest";

const TAR = "/var/lib/pulp/exports/aa-probe/export-1-20261006_2008.tar";
const TOC = "/var/lib/pulp/exports/aa-probe/export-1-20261006_2008-toc.json";
const SHA256 = "c8e8a7ff309aff3d5a23c97ea623cb95de7c362ee59d3aa00b7d65b750632f55";

afterEach(() => {
  cleanup();
});

describe("ExportFilesManifest", () => {
  it("renders every output file with its basename, full path and own algorithm label", () => {
    render(
      <ExportFilesManifest
        exportRow={{
          output_file_info: { [TAR]: "2e1a1f6d", [TOC]: SHA256 },
          toc_info: { file: TOC, sha256: SHA256, meta: {} },
        }}
      />
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);

    const tar = within(items[0]);
    expect(tar.getByText("export-1-20261006_2008.tar")).toBeTruthy();
    expect(tar.getByText(TAR)).toBeTruthy();
    expect(tar.getByText("crc32")).toBeTruthy();
    expect(tar.getByText(/2e1a1f6d/)).toBeTruthy();
    expect(tar.queryByText("sha256")).toBeNull();

    const toc = within(items[1]);
    expect(toc.getByText("export-1-20261006_2008-toc.json")).toBeTruthy();
    expect(toc.getByText(TOC)).toBeTruthy();
    expect(toc.getByText("sha256")).toBeTruthy();
    expect(toc.getByText(new RegExp(SHA256))).toBeTruthy();
  });

  it("marks only the table-of-contents entry", () => {
    render(
      <ExportFilesManifest
        exportRow={{
          output_file_info: { [TAR]: "2e1a1f6d", [TOC]: SHA256 },
          toc_info: { file: TOC, sha256: SHA256, meta: {} },
        }}
      />
    );

    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).queryByText("TOC")).toBeNull();
    expect(within(items[1]).getByText("TOC")).toBeTruthy();
  });

  it("falls back to a plain checksum label for an unrecognised digest length", () => {
    render(
      <ExportFilesManifest
        exportRow={{ output_file_info: { [TAR]: "abc123" }, toc_info: {} }}
      />
    );

    expect(screen.getByText("checksum")).toBeTruthy();
  });

  it("says so when no files were recorded", () => {
    render(<ExportFilesManifest exportRow={{ output_file_info: {}, toc_info: {} }} />);

    expect(screen.getByText("No files recorded for this export.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
