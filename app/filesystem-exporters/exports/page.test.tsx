// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import FilesystemExporterExportsPage from "@/app/filesystem-exporters/exports/page";
import type { PulpFilesystemExport, PulpFilesystemExporter } from "@/services/pulp/types";

const EXPORTER_HREF = "/pulp/api/v3/exporters/core/filesystem/e/";
const OLD_HREF = `${EXPORTER_HREF}exports/old/`;
const NEW_HREF = `${EXPORTER_HREF}exports/new/`;
const TASK_HREF = "/pulp/api/v3/tasks/t/";
const PUBLICATION_UUID = "01a11318-c61d-7925-8bbf-c3d5fc1ad891";
const VERSION_UUID = "01a112d4-ab52-7192-a364-4c02078d2489";

const { setErrorMock, getMock, listExportsMock, removeExportMock, nav } = vi.hoisted(() => ({
  setErrorMock: vi.fn(),
  getMock: vi.fn(),
  listExportsMock: vi.fn(),
  removeExportMock: vi.fn(),
  nav: { search: "" },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/components/pulp/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/pulp/auth-context", () => ({
  usePulpAuthContext: () => ({
    sessionUser: "admin",
    isLoading: false,
    isCheckingSession: false,
    hasSession: true,
    error: null,
    setError: setErrorMock,
    logout: vi.fn(),
  }),
}));
vi.mock("@/components/pulp/use-require-auth", () => ({ useRequireAuth: () => false }));
vi.mock("@/components/pulp/filesystem-exporter-edit-modal", () => ({
  FilesystemExporterEditModal: ({ onSaved }: { onSaved: () => void }) => (
    <button type="button" onClick={onSaved}>
      stub save edit
    </button>
  ),
}));
vi.mock("@/components/pulp/filesystem-export-run-modal", () => ({
  FilesystemExportRunModal: ({ onClose }: { onClose: (dispatched: boolean) => void }) => (
    <div>
      <button type="button" onClick={() => onClose(true)}>
        stub close dispatched
      </button>
      <button type="button" onClick={() => onClose(false)}>
        stub close idle
      </button>
    </div>
  ),
}));
vi.mock("@/services/pulp/filesystem-export-service", () => ({
  pulpFilesystemExportService: {
    get: getMock,
    listExports: listExportsMock,
    removeExport: removeExportMock,
  },
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

const exporter = {
  pulp_href: EXPORTER_HREF,
  name: "aa-test-fs",
  path: "/var/lib/pulp/exports/aa-test-fs",
  method: "hardlink",
} as PulpFilesystemExporter;

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
  nav.search = `pulp_href=${encodeURIComponent(EXPORTER_HREF)}`;
  getMock.mockResolvedValue(exporter);
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

/** The data rows of the exports table, newest first. */
async function dataRows() {
  await screen.findByText(`publication ${PUBLICATION_UUID}`);
  return screen.getAllByRole("row").slice(1);
}

async function openMenu(index: number) {
  const trigger = screen.getAllByRole("button", { name: /^Actions for export/ })[index];
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  return screen.findAllByRole("menuitem");
}

describe("FilesystemExporterExportsPage", () => {
  it("asks for a pulp_href when there is none", () => {
    nav.search = "";
    render(<FilesystemExporterExportsPage />);

    expect(screen.getByText("Missing pulp_href query parameter.")).toBeTruthy();
    expect(getMock).not.toHaveBeenCalled();
    expect(listExportsMock).not.toHaveBeenCalled();
  });

  it("shows the exporter in a header card: name, href, path and method", async () => {
    render(<FilesystemExporterExportsPage />);

    const card = (await screen.findByRole("heading", { name: "Exporter" })).closest("section")!;
    expect(getMock).toHaveBeenCalledWith(EXPORTER_HREF);
    expect(await within(card).findByText("aa-test-fs")).toBeTruthy();
    expect(within(card).getByText(EXPORTER_HREF)).toBeTruthy();
    expect(within(card).getByText("/var/lib/pulp/exports/aa-test-fs")).toBeTruthy();
    expect(within(card).getByText("hardlink")).toBeTruthy();
  });

  it("lists the exports newest first with task link, what was exported and the resource count", async () => {
    render(<FilesystemExporterExportsPage />);

    const [newest, oldest] = await dataRows();
    expect(listExportsMock.mock.calls[0][0]).toBe(EXPORTER_HREF);
    expect(screen.getByRole("heading", { name: "Exports (2)" })).toBeTruthy();
    // The mock answers oldest first; the page puts the newest on top.
    expect(within(newest).getByText("2026-10-06T10:00:00Z")).toBeTruthy();
    expect(within(newest).getByText(`publication ${PUBLICATION_UUID}`)).toBeTruthy();
    expect(within(newest).getByText("2")).toBeTruthy();
    expect(within(newest).getByRole("link", { name: TASK_HREF }).getAttribute("href")).toBe(
      `/tasks/detail?pulp_href=${encodeURIComponent(TASK_HREF)}`
    );
    expect(within(oldest).getByText("2026-10-01T10:00:00Z")).toBeTruthy();
    expect(within(oldest).getByText(`repository version ${VERSION_UUID}`)).toBeTruthy();
    expect(within(oldest).getByText("1")).toBeTruthy();
    expect(within(oldest).queryByRole("link")).toBeNull();
  });

  it("has no files manifest", async () => {
    render(<FilesystemExporterExportsPage />);
    await dataRows();

    expect(screen.queryByRole("list", { name: "Exported files" })).toBeNull();
  });

  it("says so when the exporter has no exports", async () => {
    listExportsMock.mockResolvedValue({ count: 0, results: [] });
    render(<FilesystemExporterExportsPage />);

    expect(await screen.findByText("No exports found.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Exports (0)" })).toBeTruthy();
  });

  it("reports a load failure through the page error", async () => {
    listExportsMock.mockRejectedValue(new Error("Pulp is down"));
    render(<FilesystemExporterExportsPage />);

    await waitFor(() => expect(setErrorMock).toHaveBeenCalledWith("Pulp is down"));
  });

  it("links back to the filesystem exporter list", async () => {
    render(<FilesystemExporterExportsPage />);

    expect(
      (await screen.findByRole("link", { name: "Back to filesystem exporters" })).getAttribute("href")
    ).toBe("/filesystem-exporters/list");
  });

  it("reloads the exporter and the exports on Refresh", async () => {
    render(<FilesystemExporterExportsPage />);
    await dataRows();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(listExportsMock).toHaveBeenCalledTimes(2));
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("reloads only the header card after the edit dialog saved", async () => {
    render(<FilesystemExporterExportsPage />);
    await dataRows();

    fireEvent.click(await screen.findByRole("button", { name: "Edit exporter" }));
    fireEvent.click(screen.getByRole("button", { name: "stub save edit" }));

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "stub save edit" })).toBeNull();
    expect(listExportsMock).toHaveBeenCalledTimes(1);
  });

  it("reloads the exports when an export was dispatched from the run dialog, not otherwise", async () => {
    render(<FilesystemExporterExportsPage />);
    await dataRows();

    fireEvent.click(await screen.findByRole("button", { name: "Run export" }));
    fireEvent.click(screen.getByRole("button", { name: "stub close idle" }));
    expect(screen.queryByRole("button", { name: "stub close idle" })).toBeNull();
    expect(listExportsMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Run export" }));
    fireEvent.click(screen.getByRole("button", { name: "stub close dispatched" }));
    await waitFor(() => expect(listExportsMock).toHaveBeenCalledTimes(2));
  });

  it("offers Delete only in the row menu", async () => {
    render(<FilesystemExporterExportsPage />);
    await dataRows();

    const items = await openMenu(0);
    expect(items.map((item) => item.textContent)).toEqual(["Delete"]);
  });

  it("deletes an export only after confirmation, then reloads", async () => {
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirmMock);
    render(<FilesystemExporterExportsPage />);
    await dataRows();

    const openDelete = async () => {
      await openMenu(0);
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    };

    await openDelete();
    expect(confirmMock).toHaveBeenCalledWith("Delete this export?");
    expect(removeExportMock).not.toHaveBeenCalled();

    await openDelete();
    await waitFor(() => expect(removeExportMock).toHaveBeenCalledWith(NEW_HREF));
    await waitFor(() => expect(listExportsMock).toHaveBeenCalledTimes(2));
  });

  it("reports a failed delete through the page error and does not reload", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    removeExportMock.mockResolvedValue({ ok: false, detail: "Not found." });
    render(<FilesystemExporterExportsPage />);
    await dataRows();

    await openMenu(0);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

    await waitFor(() => expect(setErrorMock).toHaveBeenCalledWith("Not found."));
    expect(listExportsMock).toHaveBeenCalledTimes(1);
  });
});
