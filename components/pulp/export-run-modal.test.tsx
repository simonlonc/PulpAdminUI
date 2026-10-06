// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExportRunModal } from "@/components/pulp/export-run-modal";
import type { PulpExporter } from "@/services/pulp/types";

const { runExportMock } = vi.hoisted(() => ({ runExportMock: vi.fn() }));

vi.mock("@/services/pulp/export-service", () => ({
  pulpExportService: { runExport: runExportMock },
}));

const EXPORTER_HREF = "/pulp/api/v3/exporters/core/pulp/e/";
const TASK_HREF = "/pulp/api/v3/tasks/t/";

const exporter = {
  pulp_href: EXPORTER_HREF,
  name: "aa-test",
  path: "/var/lib/pulp/exports/aa-test",
} as PulpExporter;

const onClose = vi.fn();

beforeEach(() => {
  runExportMock.mockResolvedValue({ ok: true, data: { task: TASK_HREF } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const fullBox = () => screen.getByLabelText(/^Full export/) as HTMLInputElement;
const dryRunBox = () => screen.getByLabelText(/^Dry run/) as HTMLInputElement;
const chunkInput = () => screen.getByLabelText(/^Chunk size/) as HTMLInputElement;
const run = () => fireEvent.click(screen.getByRole("button", { name: "Run export" }));

describe("ExportRunModal", () => {
  it("defaults to a full, non-dry run with a blank chunk size", () => {
    render(<ExportRunModal exporter={exporter} onClose={onClose} />);

    expect(fullBox().checked).toBe(true);
    expect(dryRunBox().checked).toBe(false);
    expect(chunkInput().value).toBe("");
    expect(chunkInput().placeholder).toBe("500MB");
    expect(screen.getByText(/Units are B, KB, MB, GB or TB/)).toBeTruthy();
  });

  it("sends no chunk_size key when it is blank", async () => {
    render(<ExportRunModal exporter={exporter} onClose={onClose} />);
    fireEvent.change(chunkInput(), { target: { value: "   " } });
    run();

    await waitFor(() => expect(runExportMock).toHaveBeenCalledTimes(1));
    expect(runExportMock).toHaveBeenCalledWith(EXPORTER_HREF, { full: true, dry_run: false });
    expect(Object.keys(runExportMock.mock.calls[0][1])).toEqual(["full", "dry_run"]);
  });

  it("sends the chosen full, dry_run and trimmed chunk_size", async () => {
    render(<ExportRunModal exporter={exporter} onClose={onClose} />);
    fireEvent.click(fullBox());
    fireEvent.click(dryRunBox());
    fireEvent.change(chunkInput(), { target: { value: " 500MB " } });
    run();

    await waitFor(() => expect(runExportMock).toHaveBeenCalledTimes(1));
    expect(runExportMock).toHaveBeenCalledWith(EXPORTER_HREF, {
      full: false,
      dry_run: true,
      chunk_size: "500MB",
    });
  });

  it("links to the dispatched task without waiting on it, and reports the dispatch on close", async () => {
    render(<ExportRunModal exporter={exporter} onClose={onClose} />);
    run();

    const link = await screen.findByRole("link", { name: TASK_HREF });
    expect(link.getAttribute("href")).toBe(
      `/tasks/detail?pulp_href=${encodeURIComponent(TASK_HREF)}`
    );
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("shows Pulp's message as returned and stays open when the export is refused", async () => {
    runExportMock.mockResolvedValue({
      ok: false,
      detail: "Cannot do an incremental export without a previous export.",
    });
    render(<ExportRunModal exporter={exporter} onClose={onClose} />);
    run();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Cannot do an incremental export without a previous export.");
    expect(screen.queryByRole("link")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledWith(false);
  });
});
