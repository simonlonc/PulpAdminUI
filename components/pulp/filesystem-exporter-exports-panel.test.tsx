// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FilesystemExporterExportsPanel } from "@/components/pulp/filesystem-exporter-exports-panel";
import type { PulpFilesystemExport, PulpFilesystemExporter } from "@/services/pulp/types";

const { setErrorMock, listExportsMock, removeExportMock } = vi.hoisted(() => ({
  setErrorMock: vi.fn(),
  listExportsMock: vi.fn(),
  removeExportMock: vi.fn(),
}));

vi.mock("@/components/pulp/auth-context", () => ({
  usePulpAuthContext: () => ({ setError: setErrorMock }),
}));
vi.mock("@/services/pulp/filesystem-export-service", () => ({
  pulpFilesystemExportService: { listExports: listExportsMock, removeExport: removeExportMock },
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

const EXPORTER_HREF = "/pulp/api/v3/exporters/core/filesystem/e/";
const OLD_HREF = `${EXPORTER_HREF}exports/old/`;
const NEW_HREF = `${EXPORTER_HREF}exports/new/`;
const TASK_HREF = "/pulp/api/v3/tasks/t/";
const PUBLICATION_UUID = "01a11318-c61d-7925-8bbf-c3d5fc1ad891";
const VERSION_UUID = "01a112d4-ab52-7192-a364-4c02078d2489";

const exporter = { pulp_href: EXPORTER_HREF, name: "aa-test-fs" } as PulpFilesystemExporter;

function exportRow(href: string, created: string, extra: Partial<PulpFilesystemExport> = {}) {
  return {
    pulp_href: href,
    pulp_created: created,
    task: null,
    exported_resources: [],
    params: {},
    ...extra,
  } as PulpFilesystemExport;
}

beforeEach(() => {
  listExportsMock.mockResolvedValue({
    count: 2,
    results: [
      exportRow(OLD_HREF, "2026-10-01T10:00:00Z", {
        exported_resources: ["/pulp/api/v3/repositories/file/file/a/versions/1/"],
        params: { repository_version: VERSION_UUID },
      }),
      exportRow(NEW_HREF, "2026-10-06T10:00:00Z", {
        task: TASK_HREF,
        exported_resources: [
          "/pulp/api/v3/publications/file/file/p/",
          "/pulp/api/v3/publications/file/file/q/",
        ],
        params: { publication: PUBLICATION_UUID },
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

describe("FilesystemExporterExportsPanel", () => {
  it("lists the exports newest first with task link, what was exported and the resource count", async () => {
    render(<FilesystemExporterExportsPanel exporter={exporter} refreshKey={0} />);

    const newest = (await screen.findByText(`publication ${PUBLICATION_UUID}`)).closest("li")!;
    expect(listExportsMock.mock.calls[0][0]).toBe(EXPORTER_HREF);
    const oldest = screen.getByText(`repository version ${VERSION_UUID}`).closest("li")!;
    // The mock answers oldest first; the panel puts the newest on top.
    expect(newest.compareDocumentPosition(oldest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(newest).getByRole("link", { name: TASK_HREF }).getAttribute("href")).toBe(
      `/tasks/detail?pulp_href=${encodeURIComponent(TASK_HREF)}`
    );
    expect(within(newest).getByText("2 exported resources")).toBeTruthy();
    expect(within(oldest).getByText("1 exported resource")).toBeTruthy();
    expect(within(oldest).queryByRole("link")).toBeNull();
  });

  it("has no files manifest", async () => {
    render(<FilesystemExporterExportsPanel exporter={exporter} refreshKey={0} />);
    await screen.findByText(`publication ${PUBLICATION_UUID}`);

    expect(screen.queryByRole("list", { name: "Exported files" })).toBeNull();
  });

  it("says so when the exporter has no exports", async () => {
    listExportsMock.mockResolvedValue({ count: 0, results: [] });
    render(<FilesystemExporterExportsPanel exporter={exporter} refreshKey={0} />);

    expect(await screen.findByText("No exports yet.")).toBeTruthy();
  });

  it("shows the load error", async () => {
    listExportsMock.mockRejectedValue(new Error("Pulp is down"));
    render(<FilesystemExporterExportsPanel exporter={exporter} refreshKey={0} />);

    expect((await screen.findByRole("alert")).textContent).toBe("Pulp is down");
  });

  it("reloads when the refresh key changes", async () => {
    const { rerender } = render(<FilesystemExporterExportsPanel exporter={exporter} refreshKey={0} />);
    await waitFor(() => expect(listExportsMock).toHaveBeenCalledTimes(1));

    rerender(<FilesystemExporterExportsPanel exporter={exporter} refreshKey={1} />);
    await waitFor(() => expect(listExportsMock).toHaveBeenCalledTimes(2));
  });

  it("reloads on Refresh", async () => {
    render(<FilesystemExporterExportsPanel exporter={exporter} refreshKey={0} />);
    await screen.findByText(`publication ${PUBLICATION_UUID}`);

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(listExportsMock).toHaveBeenCalledTimes(2));
  });

  it("deletes an export only after confirmation, then reloads", async () => {
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirmMock);
    render(<FilesystemExporterExportsPanel exporter={exporter} refreshKey={0} />);
    await screen.findByText(`publication ${PUBLICATION_UUID}`);

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
