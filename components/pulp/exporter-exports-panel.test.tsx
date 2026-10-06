// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ExporterExportsPanel } from "@/components/pulp/exporter-exports-panel";
import type { PulpExport, PulpExporter } from "@/services/pulp/types";

const { setErrorMock, listExportsMock, removeExportMock } = vi.hoisted(() => ({
  setErrorMock: vi.fn(),
  listExportsMock: vi.fn(),
  removeExportMock: vi.fn(),
}));

vi.mock("@/components/pulp/auth-context", () => ({
  usePulpAuthContext: () => ({ setError: setErrorMock }),
}));
vi.mock("@/services/pulp/export-service", () => ({
  pulpExportService: { listExports: listExportsMock, removeExport: removeExportMock },
}));

// Radix positions its menu with pointer-capture and ResizeObserver APIs that
// jsdom does not implement. Stub them so the row menu can open under test.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const EXPORTER_HREF = "/pulp/api/v3/exporters/core/pulp/e/";
const OLD_HREF = `${EXPORTER_HREF}exports/old/`;
const NEW_HREF = `${EXPORTER_HREF}exports/new/`;
const TASK_HREF = "/pulp/api/v3/tasks/t/";
const TAR = "/var/lib/pulp/exports/aa-test/export-new.tar";
const TOC = "/var/lib/pulp/exports/aa-test/export-new-toc.json";
const SHA256 = "c8e8a7ff309aff3d5a23c97ea623cb95de7c362ee59d3aa00b7d65b750632f55";

const exporter = { pulp_href: EXPORTER_HREF, name: "aa-test" } as PulpExporter;

function exportRow(href: string, created: string, extra: Partial<PulpExport> = {}) {
  return {
    pulp_href: href,
    pulp_created: created,
    task: null,
    params: {},
    output_file_info: {},
    toc_info: {},
    ...extra,
  } as PulpExport;
}

beforeEach(() => {
  listExportsMock.mockResolvedValue({
    count: 2,
    results: [
      exportRow(OLD_HREF, "2026-10-01T10:00:00Z"),
      exportRow(NEW_HREF, "2026-10-06T10:00:00Z", {
        task: TASK_HREF,
        params: { full: true, chunk_size: "500MB" },
        output_file_info: { [TAR]: "2e1a1f6d", [TOC]: SHA256 },
        toc_info: { file: TOC, sha256: SHA256 },
      }),
    ],
  });
  removeExportMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("ExporterExportsPanel", () => {
  it("lists the exporter's exports newest first with task link, params summary and files", async () => {
    render(<ExporterExportsPanel exporter={exporter} refreshKey={0} />);

    await screen.findByRole("list", { name: "Exported files" });
    expect(listExportsMock.mock.calls[0][0]).toBe(EXPORTER_HREF);

    const newest = screen.getByText("full, chunk size 500MB").closest("li")!;
    const oldest = screen.getByText("Default options").closest("li")!;
    // The mock answers oldest first; the panel puts the newest on top.
    expect(newest.compareDocumentPosition(oldest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(newest).getByRole("link", { name: TASK_HREF }).getAttribute("href")).toBe(
      `/tasks/detail?pulp_href=${encodeURIComponent(TASK_HREF)}`
    );
    expect(within(newest).getByText("export-new.tar")).toBeTruthy();
    expect(within(newest).getByText("TOC")).toBeTruthy();
    expect(within(oldest).getByText("Default options")).toBeTruthy();
    expect(within(oldest).getByText("No files recorded for this export.")).toBeTruthy();
  });

  it("says so when the exporter has no exports", async () => {
    listExportsMock.mockResolvedValue({ count: 0, results: [] });
    render(<ExporterExportsPanel exporter={exporter} refreshKey={0} />);

    expect(await screen.findByText("No exports yet.")).toBeTruthy();
  });

  it("shows the load error", async () => {
    listExportsMock.mockRejectedValue(new Error("Pulp is down"));
    render(<ExporterExportsPanel exporter={exporter} refreshKey={0} />);

    expect((await screen.findByRole("alert")).textContent).toBe("Pulp is down");
  });

  it("reloads when the refresh key changes", async () => {
    const { rerender } = render(<ExporterExportsPanel exporter={exporter} refreshKey={0} />);
    await waitFor(() => expect(listExportsMock).toHaveBeenCalledTimes(1));

    rerender(<ExporterExportsPanel exporter={exporter} refreshKey={1} />);
    await waitFor(() => expect(listExportsMock).toHaveBeenCalledTimes(2));
  });

  it("deletes an export only after confirmation, then reloads", async () => {
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirmMock);
    render(<ExporterExportsPanel exporter={exporter} refreshKey={0} />);
    await screen.findByRole("list", { name: "Exported files" });

    const openDelete = async () => {
      const trigger = screen.getAllByRole("button", { name: /^Actions for export/ })[0];
      fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    };

    await openDelete();
    expect(removeExportMock).not.toHaveBeenCalled();

    await openDelete();
    await waitFor(() => expect(removeExportMock).toHaveBeenCalledWith(NEW_HREF));
    await waitFor(() => expect(listExportsMock).toHaveBeenCalledTimes(2));
  });
});
