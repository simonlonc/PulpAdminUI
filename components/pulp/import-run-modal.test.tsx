// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImportRunModal } from "@/components/pulp/import-run-modal";
import type { PulpImportCheckResult, PulpImporter } from "@/services/pulp/types";

const { checkImportMock, runImportMock } = vi.hoisted(() => ({
  checkImportMock: vi.fn(),
  runImportMock: vi.fn(),
}));

vi.mock("@/services/pulp/import-service", () => ({
  pulpImportService: { checkImport: checkImportMock, runImport: runImportMock },
}));

const IMPORTER_HREF = "/pulp/api/v3/importers/core/pulp/i/";
const TASK_GROUP_HREF = "/pulp/api/v3/task-groups/g/";
const TOC = "/var/lib/pulp/exports/aa-probe/export-1-toc.json";
const TAR = "/var/lib/pulp/exports/aa-probe/export-1.tar";
const MAPPING = { "aa-probe-src": "aa-probe-dst" };

const plainImporter = {
  pulp_href: IMPORTER_HREF,
  name: "aa-test-imp",
  repo_mapping: {},
} as PulpImporter;
const mappedImporter = { ...plainImporter, repo_mapping: MAPPING } as PulpImporter;

const VALID: PulpImportCheckResult = {
  toc: { context: TOC, is_valid: true, messages: [] },
  repo_mapping: { context: JSON.stringify(MAPPING), is_valid: true, messages: [] },
};

const onClose = vi.fn();

beforeEach(() => {
  checkImportMock.mockResolvedValue({ ok: true, data: VALID });
  runImportMock.mockResolvedValue({ ok: true, data: { task_group: TASK_GROUP_HREF } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const sourceInput = () => screen.getByLabelText(/^(TOC file|Archive) path/) as HTMLInputElement;
const archiveRadio = () => screen.getByRole("radio", { name: /^Archive file/ }) as HTMLInputElement;
const createBox = () => screen.getByLabelText(/^Create missing repositories/) as HTMLInputElement;
const runButton = () => screen.getByRole("button", { name: "Run import" }) as HTMLButtonElement;
const check = () => fireEvent.click(screen.getByRole("button", { name: "Check" }));

function renderModal(importer = plainImporter) {
  return render(<ImportRunModal importer={importer} onClose={onClose} />);
}

/** Types the TOC path and runs a check, waiting for its answer to render. */
async function checkToc(importer = plainImporter) {
  renderModal(importer);
  fireEvent.change(sourceInput(), { target: { value: TOC } });
  check();
  await screen.findByRole("list", { name: "Check result" });
}

describe("ImportRunModal", () => {
  it("starts on the TOC source with Run import disabled, and explains the path rules", () => {
    renderModal();

    expect((screen.getByRole("radio", { name: /^TOC file/ }) as HTMLInputElement).checked).toBe(true);
    expect(archiveRadio().checked).toBe(false);
    expect(screen.getByText(/required for a chunked export/)).toBeTruthy();
    expect(createBox().checked).toBe(false);
    expect(screen.getByText(/ALLOWED_IMPORT_PATHS/)).toBeTruthy();
    expect(screen.getByText(/Pulp server setting this app cannot change/)).toBeTruthy();
    expect(runButton().disabled).toBe(true);
  });

  it("keeps Run import disabled and shows every message when one evaluation is invalid", async () => {
    checkImportMock.mockResolvedValue({
      ok: true,
      data: {
        toc: {
          context: TOC,
          is_valid: false,
          messages: ["/tmp is not an allowed import path", "Unable to read the file"],
        },
        repo_mapping: VALID.repo_mapping,
      },
    });
    await checkToc();

    const result = screen.getByRole("list", { name: "Check result" });
    const toc = within(result).getByText("toc").closest("li")!;
    expect(within(toc).getByText("Invalid")).toBeTruthy();
    expect(within(toc).getByText(TOC)).toBeTruthy();
    expect(within(toc).getByText("/tmp is not an allowed import path")).toBeTruthy();
    expect(within(toc).getByText("Unable to read the file")).toBeTruthy();
    const mapping = within(result).getByText("repo_mapping").closest("li")!;
    expect(within(mapping).getByText("Valid")).toBeTruthy();
    expect(runButton().disabled).toBe(true);
  });

  it("enables Run import after an all-valid check and links to the dispatched task group", async () => {
    await checkToc();

    expect(within(screen.getByRole("list", { name: "Check result" })).getAllByText("Valid")).toHaveLength(2);
    expect(runButton().disabled).toBe(false);

    fireEvent.click(runButton());

    const link = await screen.findByRole("link", { name: TASK_GROUP_HREF });
    expect(link.getAttribute("href")).toBe(
      `/task-groups/detail?pulp_href=${encodeURIComponent(TASK_GROUP_HREF)}`
    );
    expect(runImportMock).toHaveBeenCalledTimes(1);
    expect(runImportMock).toHaveBeenCalledWith(IMPORTER_HREF, {
      toc: TOC,
      create_repositories: false,
    });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("sends the archive path and create_repositories when they were chosen and checked", async () => {
    renderModal();
    fireEvent.click(archiveRadio());
    fireEvent.change(sourceInput(), { target: { value: ` ${TAR} ` } });
    fireEvent.click(createBox());
    checkImportMock.mockResolvedValue({
      ok: true,
      data: { path: { context: TAR, is_valid: true, messages: [] } },
    });
    check();
    await screen.findByRole("list", { name: "Check result" });
    fireEvent.click(runButton());

    await screen.findByRole("link", { name: TASK_GROUP_HREF });
    expect(checkImportMock).toHaveBeenCalledWith({ path: TAR });
    expect(runImportMock).toHaveBeenCalledWith(IMPORTER_HREF, {
      path: TAR,
      create_repositories: true,
    });
  });

  it("disables Run import again, and drops the stale result, when the input is edited after a pass", async () => {
    await checkToc();
    expect(runButton().disabled).toBe(false);

    fireEvent.change(sourceInput(), { target: { value: `${TOC}.other` } });

    expect(runButton().disabled).toBe(true);
    expect(screen.queryByRole("list", { name: "Check result" })).toBeNull();

    // Editing back to what was checked does not bring the old result back: check again.
    fireEvent.change(sourceInput(), { target: { value: TOC } });
    expect(runButton().disabled).toBe(true);
  });

  it("disables Run import again when the source or create_repositories changes after a pass", async () => {
    await checkToc();
    fireEvent.click(createBox());
    expect(runButton().disabled).toBe(true);

    fireEvent.click(createBox());
    check();
    await waitFor(() => expect(runButton().disabled).toBe(false));

    fireEvent.click(archiveRadio());
    expect(runButton().disabled).toBe(true);
  });

  it("does not let a check that was answered after an edit unlock Run import", async () => {
    let answer: (value: unknown) => void = () => {};
    checkImportMock.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderModal();
    fireEvent.change(sourceInput(), { target: { value: TOC } });
    check();
    await screen.findByRole("button", { name: "Checking…" });

    fireEvent.change(sourceInput(), { target: { value: `${TOC}.other` } });
    await act(async () => answer({ ok: true, data: VALID }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Checking…" })).toBeNull());

    expect(screen.queryByRole("list", { name: "Check result" })).toBeNull();
    expect(runButton().disabled).toBe(true);
  });

  it("does not run an import on Enter while the check has not passed", async () => {
    const { container } = renderModal();
    fireEvent.change(sourceInput(), { target: { value: TOC } });

    fireEvent.submit(container.querySelector("form")!);

    expect(runImportMock).not.toHaveBeenCalled();
  });

  it("keeps Run import disabled and shows Pulp's detail when the check is refused", async () => {
    checkImportMock.mockResolvedValue({
      ok: false,
      detail: "One of path, toc, or repo_mapping must be specified.",
    });
    renderModal();
    fireEvent.change(sourceInput(), { target: { value: TOC } });
    check();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("One of path, toc, or repo_mapping must be specified.");
    expect(runButton().disabled).toBe(true);
  });

  it("keeps Run import disabled and shows the message when the check request itself fails", async () => {
    checkImportMock.mockRejectedValue(new Error("Failed to fetch"));
    renderModal();
    fireEvent.change(sourceInput(), { target: { value: TOC } });
    check();

    expect((await screen.findByRole("alert")).textContent).toBe("Failed to fetch");
    expect(runButton().disabled).toBe(true);
  });

  it("asks for a path before calling Pulp", () => {
    renderModal();
    fireEvent.change(sourceInput(), { target: { value: "   " } });
    check();

    expect(screen.getByRole("alert").textContent).toBe("TOC file path is required.");
    expect(checkImportMock).not.toHaveBeenCalled();
  });

  it("omits repo_mapping from the check when the importer has none", async () => {
    await checkToc(plainImporter);

    expect(checkImportMock).toHaveBeenCalledTimes(1);
    expect(checkImportMock).toHaveBeenCalledWith({ toc: TOC });
    expect(Object.keys(checkImportMock.mock.calls[0][0])).toEqual(["toc"]);
  });

  it("includes the importer's repo_mapping in the check when it has one", async () => {
    await checkToc(mappedImporter);

    expect(checkImportMock).toHaveBeenCalledWith({ toc: TOC, repo_mapping: MAPPING });
  });

  it("shows Pulp's message as returned and no task group when the import is refused", async () => {
    runImportMock.mockResolvedValue({
      ok: false,
      detail: "Failed to find repositories from repo_mapping: names: ['aa-probe-dst']",
    });
    await checkToc();
    fireEvent.click(runButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Failed to find repositories from repo_mapping: names: ['aa-probe-dst']"
    );
    expect(screen.queryByRole("link")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledWith(false);
  });
});
