// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import ImporterImportsPage from "@/app/importers/imports/page";
import type { PulpImport, PulpImporter } from "@/services/pulp/types";

const IMPORTER_HREF = "/pulp/api/v3/importers/core/pulp/i/";
const OLD_HREF = `${IMPORTER_HREF}imports/old/`;
const NEW_HREF = `${IMPORTER_HREF}imports/new/`;
const TASK_HREF = "/pulp/api/v3/tasks/t/";
const TOC = "/var/lib/pulp/exports/aa-probe/export-new-toc.json";
const TAR = "/var/lib/pulp/exports/aa-probe/export-old.tar";

const { setErrorMock, getMock, listImportsMock, removeImportMock, nav } = vi.hoisted(() => ({
  setErrorMock: vi.fn(),
  getMock: vi.fn(),
  listImportsMock: vi.fn(),
  removeImportMock: vi.fn(),
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
vi.mock("@/components/pulp/importer-edit-modal", () => ({
  ImporterEditModal: ({ onSaved }: { onSaved: () => void }) => (
    <button type="button" onClick={onSaved}>
      stub save edit
    </button>
  ),
}));
vi.mock("@/components/pulp/import-run-modal", () => ({
  ImportRunModal: ({ onClose }: { onClose: (dispatched: boolean) => void }) => (
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
vi.mock("@/services/pulp/import-service", () => ({
  pulpImportService: {
    get: getMock,
    listImports: listImportsMock,
    removeImport: removeImportMock,
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

const importer = {
  pulp_href: IMPORTER_HREF,
  name: "aa-test-imp",
  repo_mapping: { "src-repo": "dst-repo" } as Record<string, string>,
} as PulpImporter;

function importRow(href: string, created: string, extra: Partial<PulpImport> = {}) {
  return {
    pulp_href: href,
    pulp_created: created,
    task: null,
    params: {},
    ...extra,
  } as PulpImport;
}

beforeEach(() => {
  nav.search = `pulp_href=${encodeURIComponent(IMPORTER_HREF)}`;
  getMock.mockResolvedValue(importer);
  listImportsMock.mockResolvedValue({
    count: 2,
    results: [
      importRow(OLD_HREF, "2026-10-01T10:00:00Z", { params: { path: TAR } }),
      importRow(NEW_HREF, "2026-10-06T10:00:00Z", { task: TASK_HREF, params: { toc: TOC } }),
    ],
  });
  removeImportMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/** The data rows of the imports table, newest first. */
async function dataRows() {
  await screen.findByText(TOC);
  return screen.getAllByRole("row").slice(1);
}

async function openMenu(index: number) {
  const trigger = screen.getAllByRole("button", { name: /^Actions for import/ })[index];
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  return screen.findAllByRole("menuitem");
}

describe("ImporterImportsPage", () => {
  it("asks for a pulp_href when there is none", () => {
    nav.search = "";
    render(<ImporterImportsPage />);

    expect(screen.getByText("Missing pulp_href query parameter.")).toBeTruthy();
    expect(getMock).not.toHaveBeenCalled();
    expect(listImportsMock).not.toHaveBeenCalled();
  });

  it("shows the importer in a header card: name, href and repository mapping", async () => {
    render(<ImporterImportsPage />);

    const card = (await screen.findByRole("heading", { name: "Importer" })).closest("section")!;
    expect(getMock).toHaveBeenCalledWith(IMPORTER_HREF);
    expect(await within(card).findByText("aa-test-imp")).toBeTruthy();
    expect(within(card).getByText(IMPORTER_HREF)).toBeTruthy();
    expect(within(card).getByText("src-repo -> dst-repo")).toBeTruthy();
  });

  it("says the mapping is none when the importer has no repo_mapping", async () => {
    getMock.mockResolvedValue({ ...importer, repo_mapping: {} });
    render(<ImporterImportsPage />);

    const card = (await screen.findByRole("heading", { name: "Importer" })).closest("section")!;
    expect(await within(card).findByText("None")).toBeTruthy();
  });

  it("lists the importer's imports newest first with task link and params", async () => {
    render(<ImporterImportsPage />);

    const [newest, oldest] = await dataRows();
    expect(listImportsMock.mock.calls[0][0]).toBe(IMPORTER_HREF);
    expect(screen.getByRole("heading", { name: "Imports (2)" })).toBeTruthy();
    // The mock answers oldest first; the page puts the newest on top.
    expect(within(newest).getByText("2026-10-06T10:00:00Z")).toBeTruthy();
    expect(within(newest).getByText("toc")).toBeTruthy();
    expect(within(newest).getByText(TOC, { exact: false })).toBeTruthy();
    expect(within(newest).getByRole("link", { name: TASK_HREF }).getAttribute("href")).toBe(
      `/tasks/detail?pulp_href=${encodeURIComponent(TASK_HREF)}`
    );
    expect(within(oldest).getByText("2026-10-01T10:00:00Z")).toBeTruthy();
    expect(within(oldest).getByText("path")).toBeTruthy();
    expect(within(oldest).getByText(TAR, { exact: false })).toBeTruthy();
    expect(within(oldest).queryByRole("link")).toBeNull();
  });

  it("says so when the importer has no imports", async () => {
    listImportsMock.mockResolvedValue({ count: 0, results: [] });
    render(<ImporterImportsPage />);

    expect(await screen.findByText("No imports found.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Imports (0)" })).toBeTruthy();
  });

  it("reports a load failure through the page error", async () => {
    listImportsMock.mockRejectedValue(new Error("Pulp is down"));
    render(<ImporterImportsPage />);

    await waitFor(() => expect(setErrorMock).toHaveBeenCalledWith("Pulp is down"));
  });

  it("links back to the importer list", async () => {
    render(<ImporterImportsPage />);

    expect((await screen.findByRole("link", { name: "Back to importers" })).getAttribute("href")).toBe(
      "/importers/list"
    );
  });

  it("reloads the importer and the imports on Refresh", async () => {
    render(<ImporterImportsPage />);
    await dataRows();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(listImportsMock).toHaveBeenCalledTimes(2));
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("reloads only the header card after the edit dialog saved", async () => {
    render(<ImporterImportsPage />);
    await dataRows();

    fireEvent.click(await screen.findByRole("button", { name: "Edit importer" }));
    fireEvent.click(screen.getByRole("button", { name: "stub save edit" }));

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "stub save edit" })).toBeNull();
    expect(listImportsMock).toHaveBeenCalledTimes(1);
  });

  it("reloads the imports when an import was dispatched from the run dialog, not otherwise", async () => {
    render(<ImporterImportsPage />);
    await dataRows();

    fireEvent.click(await screen.findByRole("button", { name: "Run import" }));
    fireEvent.click(screen.getByRole("button", { name: "stub close idle" }));
    expect(screen.queryByRole("button", { name: "stub close idle" })).toBeNull();
    expect(listImportsMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Run import" }));
    fireEvent.click(screen.getByRole("button", { name: "stub close dispatched" }));
    await waitFor(() => expect(listImportsMock).toHaveBeenCalledTimes(2));
  });

  it("offers Delete only in the row menu", async () => {
    render(<ImporterImportsPage />);
    await dataRows();

    const items = await openMenu(0);
    expect(items.map((item) => item.textContent)).toEqual(["Delete"]);
  });

  it("deletes an import only after confirmation, then reloads", async () => {
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirmMock);
    render(<ImporterImportsPage />);
    await dataRows();

    const openDelete = async () => {
      await openMenu(0);
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    };

    await openDelete();
    expect(confirmMock).toHaveBeenCalledWith("Delete this import?");
    expect(removeImportMock).not.toHaveBeenCalled();

    await openDelete();
    await waitFor(() => expect(removeImportMock).toHaveBeenCalledWith(NEW_HREF));
    await waitFor(() => expect(listImportsMock).toHaveBeenCalledTimes(2));
  });

  it("reports a failed delete through the page error and does not reload", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    removeImportMock.mockResolvedValue({ ok: false, detail: "Not found." });
    render(<ImporterImportsPage />);
    await dataRows();

    await openMenu(0);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

    await waitFor(() => expect(setErrorMock).toHaveBeenCalledWith("Not found."));
    expect(listImportsMock).toHaveBeenCalledTimes(1);
  });
});
