// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import ImportersListPage from "@/app/importers/list/page";
import type { PulpImporter } from "@/services/pulp/types";

const FIRST_HREF = "/pulp/api/v3/importers/core/pulp/first/";
const SECOND_HREF = "/pulp/api/v3/importers/core/pulp/second/";

const { deleteImporterMock, refreshImportersMock } = vi.hoisted(() => ({
  deleteImporterMock: vi.fn(),
  refreshImportersMock: vi.fn(),
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
vi.mock("@/components/pulp/use-pulp-importers", () => ({
  usePulpImporters: () => ({
    importers: [
      { pulp_href: FIRST_HREF, name: "first", repo_mapping: { "src-repo": "dst-repo" } },
      { pulp_href: SECOND_HREF, name: "second", repo_mapping: {} },
    ] as PulpImporter[],
    count: 2,
    deleteImporter: deleteImporterMock,
    refreshImporters: refreshImportersMock,
  }),
}));
vi.mock("@/components/pulp/importer-create-modal", () => ({
  ImporterCreateModal: () => <div>stub create dialog</div>,
}));
vi.mock("@/components/pulp/importer-edit-modal", () => ({
  ImporterEditModal: ({ importer }: { importer: PulpImporter }) => (
    <div>stub edit dialog for {importer.name}</div>
  ),
}));
vi.mock("@/components/pulp/import-run-modal", () => ({
  ImportRunModal: ({ importer }: { importer: PulpImporter }) => (
    <div>stub run dialog for {importer.name}</div>
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
  deleteImporterMock.mockResolvedValue(undefined);
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

describe("ImportersListPage", () => {
  it("renders the list like the other list pages: a titled card, the data columns and Actions", () => {
    render(<ImportersListPage />);

    expect(screen.getByText("Importers")).toBeTruthy();
    expect(screen.getByText("(2 total)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New importer" })).toBeTruthy();
    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent?.trim())
    ).toEqual(["Name", "Repository mapping", "Actions"]);
    const [first, second] = screen.getAllByRole("row").slice(1);
    expect(within(first).getByText("first")).toBeTruthy();
    expect(within(first).getByText("src-repo -> dst-repo")).toBeTruthy();
    expect(within(second).getByText("None")).toBeTruthy();
    expect(screen.queryByText(/Last import/)).toBeNull();
    expect(screen.queryByText(/delete the importer and create it again/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /expand|collapse/i })).toBeNull();
  });

  it("orders the row menu Edit, Imports, separator, Run import, separator, Delete", async () => {
    render(<ImportersListPage />);

    const items = await openMenu("first");
    expect(items.map((item) => item.textContent)).toEqual([
      "Edit",
      "Imports",
      "Run import",
      "Delete",
    ]);
    const separators = screen.getAllByRole("separator");
    expect(separators).toHaveLength(2);
    // Separators sit between Imports/Run import and Run import/Delete.
    const [edit, imports, run, del] = items;
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(imports, separators[0]) && before(separators[0], run)).toBe(true);
    expect(before(run, separators[1]) && before(separators[1], del)).toBe(true);
    expect(before(edit, imports)).toBe(true);
  });

  it("links Imports to the history page with the encoded pulp_href", async () => {
    render(<ImportersListPage />);

    await openMenu("first");
    expect(screen.getByRole("menuitem", { name: "Imports" }).getAttribute("href")).toBe(
      `/importers/imports?pulp_href=${encodeURIComponent(FIRST_HREF)}`
    );
  });

  it("opens the edit dialog for the row it was chosen on", async () => {
    render(<ImportersListPage />);

    await openMenu("second");
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(await screen.findByText("stub edit dialog for second")).toBeTruthy();
  });

  it("opens the run dialog for the row it was chosen on", async () => {
    render(<ImportersListPage />);

    await openMenu("first");
    fireEvent.click(screen.getByRole("menuitem", { name: "Run import" }));

    expect(await screen.findByText("stub run dialog for first")).toBeTruthy();
  });

  it("deletes only after confirming with the site's wording", async () => {
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirmMock);
    render(<ImportersListPage />);

    await openMenu("first");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(confirmMock).toHaveBeenCalledWith("Delete importer “first”? This cannot be undone.");
    expect(deleteImporterMock).not.toHaveBeenCalled();

    await openMenu("first");
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(deleteImporterMock).toHaveBeenCalledWith(FIRST_HREF);
  });

  it("opens the create dialog", () => {
    render(<ImportersListPage />);

    fireEvent.click(screen.getByRole("button", { name: "New importer" }));
    expect(screen.getByText("stub create dialog")).toBeTruthy();
  });
});
