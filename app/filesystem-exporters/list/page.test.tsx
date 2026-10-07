// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import FilesystemExportersListPage from "@/app/filesystem-exporters/list/page";
import type { PulpFilesystemExporter } from "@/services/pulp/types";

const FIRST_HREF = "/pulp/api/v3/exporters/core/filesystem/first/";
const SECOND_HREF = "/pulp/api/v3/exporters/core/filesystem/second/";

const { deleteExporterMock, refreshExportersMock } = vi.hoisted(() => ({
  deleteExporterMock: vi.fn(),
  refreshExportersMock: vi.fn(),
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
    logout: vi.fn(),
  }),
}));
vi.mock("@/components/pulp/use-require-auth", () => ({ useRequireAuth: () => false }));
vi.mock("@/components/pulp/use-pulp-list-query", () => ({
  usePulpListQuery: () => ({
    query: { search: "", pageSize: 25, page: 1, ordering: "", q: "" },
    params: new URLSearchParams(),
    setOrdering: vi.fn(),
    setPage: vi.fn(),
    setPageSize: vi.fn(),
    setFilters: vi.fn(),
  }),
}));
vi.mock("@/components/pulp/use-pulp-filesystem-exporters", () => ({
  usePulpFilesystemExporters: () => ({
    exporters: [
      {
        pulp_href: FIRST_HREF,
        name: "first",
        path: "/var/lib/pulp/exports/first",
        method: "hardlink",
      },
      {
        pulp_href: SECOND_HREF,
        name: "second",
        path: "/var/lib/pulp/exports/second",
        method: "symlink",
      },
    ] as PulpFilesystemExporter[],
    count: 2,
    deleteExporter: deleteExporterMock,
    refreshExporters: refreshExportersMock,
  }),
}));
vi.mock("@/components/pulp/filesystem-exporter-create-modal", () => ({
  FilesystemExporterCreateModal: () => <div>stub create dialog</div>,
}));
vi.mock("@/components/pulp/filesystem-exporter-edit-modal", () => ({
  FilesystemExporterEditModal: ({ exporter }: { exporter: PulpFilesystemExporter }) => (
    <div>stub edit dialog for {exporter.name}</div>
  ),
}));
vi.mock("@/components/pulp/filesystem-export-run-modal", () => ({
  FilesystemExportRunModal: ({ exporter }: { exporter: PulpFilesystemExporter }) => (
    <div>stub run dialog for {exporter.name}</div>
  ),
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

beforeEach(() => {
  deleteExporterMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function openMenu(name: string) {
  const trigger = screen.getByRole("button", { name: `Actions for ${name}` });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  return screen.findAllByRole("menuitem");
}

describe("FilesystemExportersListPage", () => {
  it("renders the list like the other list pages: a titled card, the data columns and Actions", () => {
    render(<FilesystemExportersListPage />);

    expect(screen.getByText("Filesystem exporters")).toBeTruthy();
    expect(screen.getByText("(2 total)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New filesystem exporter" })).toBeTruthy();
    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent?.trim())
    ).toEqual(["Name", "Path", "Method", "Actions"]);
    const [first] = screen.getAllByRole("row").slice(1);
    expect(within(first).getByText("first")).toBeTruthy();
    expect(within(first).getByText("/var/lib/pulp/exports/first")).toBeTruthy();
    expect(within(first).getByText("hardlink")).toBeTruthy();
    expect(screen.queryByText(/Last export/)).toBeNull();
    expect(screen.queryByRole("button", { name: /expand|collapse/i })).toBeNull();
  });

  it("orders the row menu Edit, Exports, separator, Run export, separator, Delete", async () => {
    render(<FilesystemExportersListPage />);

    const items = await openMenu("first");
    expect(items.map((item) => item.textContent)).toEqual([
      "Edit",
      "Exports",
      "Run export",
      "Delete",
    ]);
    const separators = screen.getAllByRole("separator");
    expect(separators).toHaveLength(2);
    // Separators sit between Exports/Run export and Run export/Delete.
    const [edit, exports, run, del] = items;
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(exports, separators[0]) && before(separators[0], run)).toBe(true);
    expect(before(run, separators[1]) && before(separators[1], del)).toBe(true);
    expect(before(edit, exports)).toBe(true);
  });

  it("links Exports to the history page with the encoded pulp_href", async () => {
    render(<FilesystemExportersListPage />);

    await openMenu("first");
    expect(screen.getByRole("menuitem", { name: "Exports" }).getAttribute("href")).toBe(
      `/filesystem-exporters/exports?pulp_href=${encodeURIComponent(FIRST_HREF)}`
    );
  });

  it("opens the edit dialog for the row it was chosen on", async () => {
    render(<FilesystemExportersListPage />);

    await openMenu("second");
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(await screen.findByText("stub edit dialog for second")).toBeTruthy();
  });

  it("opens the run dialog for the row it was chosen on", async () => {
    render(<FilesystemExportersListPage />);

    await openMenu("first");
    fireEvent.click(screen.getByRole("menuitem", { name: "Run export" }));

    expect(await screen.findByText("stub run dialog for first")).toBeTruthy();
  });

  it("deletes only after confirming with the site's wording", async () => {
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirmMock);
    render(<FilesystemExportersListPage />);

    await openMenu("first");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(confirmMock).toHaveBeenCalledWith("Delete exporter “first”? This cannot be undone.");
    expect(deleteExporterMock).not.toHaveBeenCalled();

    await openMenu("first");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(deleteExporterMock).toHaveBeenCalledWith(FIRST_HREF);
  });

  it("opens the create dialog", () => {
    render(<FilesystemExportersListPage />);

    fireEvent.click(screen.getByRole("button", { name: "New filesystem exporter" }));
    expect(screen.getByText("stub create dialog")).toBeTruthy();
  });
});
