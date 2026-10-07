// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ImporterImportsPanel } from "@/components/pulp/importer-imports-panel";
import type { PulpImport, PulpImporter } from "@/services/pulp/types";

const { setErrorMock, listImportsMock, removeImportMock } = vi.hoisted(() => ({
  setErrorMock: vi.fn(),
  listImportsMock: vi.fn(),
  removeImportMock: vi.fn(),
}));

vi.mock("@/components/pulp/auth-context", () => ({
  usePulpAuthContext: () => ({ setError: setErrorMock }),
}));
vi.mock("@/services/pulp/import-service", () => ({
  pulpImportService: { listImports: listImportsMock, removeImport: removeImportMock },
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

const IMPORTER_HREF = "/pulp/api/v3/importers/core/pulp/i/";
const OLD_HREF = `${IMPORTER_HREF}imports/old/`;
const NEW_HREF = `${IMPORTER_HREF}imports/new/`;
const TASK_HREF = "/pulp/api/v3/tasks/t/";
const TOC = "/var/lib/pulp/exports/aa-probe/export-new-toc.json";
const TAR = "/var/lib/pulp/exports/aa-probe/export-old.tar";

const importer = { pulp_href: IMPORTER_HREF, name: "aa-test-imp" } as PulpImporter;

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

describe("ImporterImportsPanel", () => {
  it("lists the importer's imports newest first with task link and params", async () => {
    render(<ImporterImportsPanel importer={importer} refreshKey={0} />);

    const newest = (await screen.findByText(`toc: ${TOC}`)).closest("li")!;
    const oldest = screen.getByText(`path: ${TAR}`).closest("li")!;
    expect(listImportsMock.mock.calls[0][0]).toBe(IMPORTER_HREF);
    // The mock answers oldest first; the panel puts the newest on top.
    expect(newest.compareDocumentPosition(oldest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(newest).getByRole("link", { name: TASK_HREF }).getAttribute("href")).toBe(
      `/tasks/detail?pulp_href=${encodeURIComponent(TASK_HREF)}`
    );
    expect(within(oldest).queryByRole("link")).toBeNull();
    expect(screen.getByText("(2 total)")).toBeTruthy();
  });

  it("says so when the importer has no imports", async () => {
    listImportsMock.mockResolvedValue({ count: 0, results: [] });
    render(<ImporterImportsPanel importer={importer} refreshKey={0} />);

    expect(await screen.findByText("No imports yet.")).toBeTruthy();
  });

  it("shows the load error", async () => {
    listImportsMock.mockRejectedValue(new Error("Pulp is down"));
    render(<ImporterImportsPanel importer={importer} refreshKey={0} />);

    expect((await screen.findByRole("alert")).textContent).toBe("Pulp is down");
  });

  it("reloads when the refresh key changes", async () => {
    const { rerender } = render(<ImporterImportsPanel importer={importer} refreshKey={0} />);
    await waitFor(() => expect(listImportsMock).toHaveBeenCalledTimes(1));

    rerender(<ImporterImportsPanel importer={importer} refreshKey={1} />);
    await waitFor(() => expect(listImportsMock).toHaveBeenCalledTimes(2));
  });

  it("reloads on Refresh", async () => {
    render(<ImporterImportsPanel importer={importer} refreshKey={0} />);
    await screen.findByText(`toc: ${TOC}`);

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(listImportsMock).toHaveBeenCalledTimes(2));
  });

  it("deletes an import only after confirmation, then reloads", async () => {
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirmMock);
    render(<ImporterImportsPanel importer={importer} refreshKey={0} />);
    await screen.findByText(`toc: ${TOC}`);

    const openDelete = async () => {
      const trigger = screen.getAllByRole("button", { name: /^Actions for import/ })[0];
      fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
      fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    };

    await openDelete();
    expect(removeImportMock).not.toHaveBeenCalled();

    await openDelete();
    await waitFor(() => expect(removeImportMock).toHaveBeenCalledWith(NEW_HREF));
    await waitFor(() => expect(listImportsMock).toHaveBeenCalledTimes(2));
  });

  it("reports a failed delete through the page error and does not reload", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    removeImportMock.mockResolvedValue({ ok: false, detail: "Not found." });
    render(<ImporterImportsPanel importer={importer} refreshKey={0} />);
    await screen.findByText(`toc: ${TOC}`);

    const trigger = screen.getAllByRole("button", { name: /^Actions for import/ })[0];
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

    await waitFor(() => expect(setErrorMock).toHaveBeenCalledWith("Not found."));
    expect(listImportsMock).toHaveBeenCalledTimes(1);
  });
});
