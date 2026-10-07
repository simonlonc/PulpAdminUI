// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import ExporterExportsPage from "@/app/exporters/exports/page";
import type { PulpRepositoryOption } from "@/components/pulp/use-pulp-repository-options";
import type { PulpExport, PulpExporter } from "@/services/pulp/types";

const EXPORTER_HREF = "/pulp/api/v3/exporters/core/pulp/e/";
const OLD_HREF = `${EXPORTER_HREF}exports/old/`;
const NEW_HREF = `${EXPORTER_HREF}exports/new/`;
const TASK_HREF = "/pulp/api/v3/tasks/t/";
const REPO_HREF = "/pulp/api/v3/repositories/file/file/r/";
const TAR = "/var/lib/pulp/exports/aa-test/export-new.tar";
const TOC = "/var/lib/pulp/exports/aa-test/export-new-toc.json";
const SHA256 = "c8e8a7ff309aff3d5a23c97ea623cb95de7c362ee59d3aa00b7d65b750632f55";

const { setErrorMock, getMock, listExportsMock, removeExportMock, getPublishFilesMock, nav } = vi.hoisted(
  () => ({
    setErrorMock: vi.fn(),
    getMock: vi.fn(),
    listExportsMock: vi.fn(),
    removeExportMock: vi.fn(),
    getPublishFilesMock: vi.fn(),
    nav: { search: "" },
  })
);

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
vi.mock("@/components/pulp/use-pulp-repository-options", () => ({
  usePulpRepositoryOptions: () => ({
    repositoryOptions: [
      { href: REPO_HREF, name: "aa-files", kind: "file", latestVersionHref: null },
    ] satisfies PulpRepositoryOption[],
  }),
}));
vi.mock("@/components/pulp/exporter-edit-modal", () => ({
  ExporterEditModal: ({ onSaved }: { onSaved: () => void }) => (
    <button type="button" onClick={onSaved}>
      stub save edit
    </button>
  ),
}));
vi.mock("@/components/pulp/export-run-modal", () => ({
  ExportRunModal: ({ onClose }: { onClose: (dispatched: boolean) => void }) => (
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
vi.mock("@/services/pulp/export-service", () => ({
  pulpExportService: {
    get: getMock,
    listExports: listExportsMock,
    removeExport: removeExportMock,
    getPublishFiles: getPublishFilesMock,
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
  name: "aa-test",
  path: "/var/lib/pulp/exports/aa-test",
  repositories: [REPO_HREF, "/pulp/api/v3/repositories/rpm/rpm/unlisted/"],
} as PulpExporter;

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
  nav.search = `pulp_href=${encodeURIComponent(EXPORTER_HREF)}`;
  getMock.mockResolvedValue(exporter);
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
  getPublishFilesMock.mockResolvedValue({
    configured: true,
    files: [
      { path: TAR, checksum: "2e1a1f6d", file_url: "http://files.test/export-new.tar" },
      { path: TOC, checksum: SHA256, file_url: "http://files.test/export-new-toc.json" },
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/** The data rows of the exports table, newest first. */
async function dataRows() {
  await screen.findByRole("list", { name: "Exported files" });
  return screen.getAllByRole("row").slice(1);
}

async function openMenu(index: number) {
  const trigger = screen.getAllByRole("button", { name: /^Actions for export/ })[index];
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  return screen.findAllByRole("menuitem");
}

describe("ExporterExportsPage", () => {
  it("asks for a pulp_href when there is none", () => {
    nav.search = "";
    render(<ExporterExportsPage />);

    expect(screen.getByText("Missing pulp_href query parameter.")).toBeTruthy();
    expect(getMock).not.toHaveBeenCalled();
    expect(listExportsMock).not.toHaveBeenCalled();
  });

  it("shows the exporter in a header card: name, href, path and its repositories by name", async () => {
    render(<ExporterExportsPage />);

    const card = (await screen.findByRole("heading", { name: "Exporter" })).closest("section")!;
    expect(getMock).toHaveBeenCalledWith(EXPORTER_HREF);
    expect(await within(card).findByText("aa-test")).toBeTruthy();
    expect(within(card).getByText(EXPORTER_HREF)).toBeTruthy();
    expect(within(card).getByText("/var/lib/pulp/exports/aa-test")).toBeTruthy();
    expect(within(card).getByText("aa-files")).toBeTruthy();
    // A repository the options do not know falls back to its href.
    expect(within(card).getByText("/pulp/api/v3/repositories/rpm/rpm/unlisted/")).toBeTruthy();
  });

  it("lists the exports newest first with params summary, files and a task link", async () => {
    render(<ExporterExportsPage />);

    const [newest, oldest] = await dataRows();
    expect(listExportsMock.mock.calls[0][0]).toBe(EXPORTER_HREF);
    expect(screen.getByRole("heading", { name: "Exports (2)" })).toBeTruthy();
    // The mock answers oldest first; the page puts the newest on top.
    expect(within(newest).getByText("2026-10-06T10:00:00Z")).toBeTruthy();
    expect(within(newest).getByText("full, chunk size 500MB")).toBeTruthy();
    expect(within(newest).getByText("export-new.tar")).toBeTruthy();
    expect(within(newest).getByText("TOC")).toBeTruthy();
    expect(within(newest).getByRole("link", { name: TASK_HREF }).getAttribute("href")).toBe(
      `/tasks/detail?pulp_href=${encodeURIComponent(TASK_HREF)}`
    );
    expect(within(oldest).getByText("2026-10-01T10:00:00Z")).toBeTruthy();
    expect(within(oldest).getByText("Default options")).toBeTruthy();
    expect(within(oldest).getByText("No files recorded for this export.")).toBeTruthy();
    expect(within(oldest).queryByRole("link")).toBeNull();
  });

  it("says so when the exporter has no exports", async () => {
    listExportsMock.mockResolvedValue({ count: 0, results: [] });
    render(<ExporterExportsPage />);

    expect(await screen.findByText("No exports found.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Exports (0)" })).toBeTruthy();
  });

  it("reports a load failure through the page error", async () => {
    listExportsMock.mockRejectedValue(new Error("Pulp is down"));
    render(<ExporterExportsPage />);

    await waitFor(() => expect(setErrorMock).toHaveBeenCalledWith("Pulp is down"));
  });

  it("says how many are shown when the history is longer than one page", async () => {
    listExportsMock.mockResolvedValue({
      count: 250,
      results: [exportRow(NEW_HREF, "2026-10-06T10:00:00Z")],
    });
    render(<ExporterExportsPage />);

    expect(await screen.findByText(/Showing the first 1 of 250\s+exports\./)).toBeTruthy();
  });

  it("links back to the exporter list", async () => {
    render(<ExporterExportsPage />);

    expect(
      (await screen.findByRole("link", { name: "Back to exporters" })).getAttribute("href")
    ).toBe("/exporters/list");
  });

  it("reloads the exporter and the exports on Refresh", async () => {
    render(<ExporterExportsPage />);
    await dataRows();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(listExportsMock).toHaveBeenCalledTimes(2));
    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("reloads only the header card after the edit dialog saved", async () => {
    render(<ExporterExportsPage />);
    await dataRows();

    fireEvent.click(await screen.findByRole("button", { name: "Edit exporter" }));
    fireEvent.click(screen.getByRole("button", { name: "stub save edit" }));

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "stub save edit" })).toBeNull();
    expect(listExportsMock).toHaveBeenCalledTimes(1);
  });

  it("reloads the exports when an export was dispatched from the run dialog, not otherwise", async () => {
    render(<ExporterExportsPage />);
    await dataRows();

    fireEvent.click(await screen.findByRole("button", { name: "Run export" }));
    fireEvent.click(screen.getByRole("button", { name: "stub close idle" }));
    expect(screen.queryByRole("button", { name: "stub close idle" })).toBeNull();
    expect(listExportsMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Run export" }));
    fireEvent.click(screen.getByRole("button", { name: "stub close dispatched" }));
    await waitFor(() => expect(listExportsMock).toHaveBeenCalledTimes(2));
  });

  it("deletes an export only after confirmation, then reloads", async () => {
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirmMock);
    render(<ExporterExportsPage />);
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
    render(<ExporterExportsPage />);
    await dataRows();

    await openMenu(0);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

    await waitFor(() => expect(setErrorMock).toHaveBeenCalledWith("Not found."));
    expect(listExportsMock).toHaveBeenCalledTimes(1);
  });

  describe("row menu", () => {
    it("offers Publish to repository, a separator and Delete last", async () => {
      render(<ExporterExportsPage />);
      await dataRows();

      const items = await openMenu(0);
      expect(items.map((item) => item.textContent)).toEqual(["Publish to repository", "Delete"]);
      expect(screen.getAllByRole("separator")).toHaveLength(1);
    });

    it("publishes an export that wrote files, offering the repositories the page loaded", async () => {
      render(<ExporterExportsPage />);
      await dataRows();

      const [publish] = await openMenu(0);
      expect(publish.getAttribute("aria-disabled")).toBeNull();
      fireEvent.click(publish);

      const dialog = await screen.findByRole("dialog", { name: "Publish to repository" });
      expect(getPublishFilesMock).toHaveBeenCalledWith(NEW_HREF);
      await within(dialog).findByRole("list", { name: "Files to publish" });
      expect(within(dialog).getByRole("option", { name: "aa-files" })).toBeTruthy();

      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("disables Publish for a dry-run export, whose files were never written", async () => {
      listExportsMock.mockResolvedValue({
        count: 1,
        results: [
          exportRow(NEW_HREF, "2026-10-06T10:00:00Z", {
            params: { full: true, dry_run: true },
            output_file_info: { [TAR]: "2e1a1f6d", [TOC]: SHA256 },
            toc_info: { file: TOC, sha256: SHA256 },
          }),
        ],
      });
      render(<ExporterExportsPage />);
      await dataRows();

      const [publish] = await openMenu(0);
      expect(publish.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(publish);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(getPublishFilesMock).not.toHaveBeenCalled();
    });

    it("disables Publish for an export with no files", async () => {
      render(<ExporterExportsPage />);
      await dataRows();

      // Newest first, so the second row is the old export without files.
      const [publish] = await openMenu(1);
      expect(publish.getAttribute("aria-disabled")).toBe("true");
    });
  });
});
