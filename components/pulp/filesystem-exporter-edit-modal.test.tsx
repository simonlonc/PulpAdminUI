// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FilesystemExporterEditModal } from "@/components/pulp/filesystem-exporter-edit-modal";
import type { PulpFilesystemExporter } from "@/services/pulp/types";

const { updateMock } = vi.hoisted(() => ({ updateMock: vi.fn() }));

vi.mock("@/services/pulp/filesystem-export-service", () => ({
  pulpFilesystemExportService: { update: updateMock },
}));

const exporter: PulpFilesystemExporter = {
  pulp_href: "/pulp/api/v3/exporters/core/filesystem/f1/",
  prn: "prn:core.filesystemexporter:f1",
  pulp_created: "2026-01-01T00:00:00Z",
  pulp_last_updated: "2026-01-01T00:00:00Z",
  name: "mirror",
  path: "/var/lib/pulp/exports/mirror",
  method: "hardlink",
};

const onClose = vi.fn();
const onSaved = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal() {
  return render(<FilesystemExporterEditModal exporter={exporter} onClose={onClose} onSaved={onSaved} />);
}

const methodSelect = () => screen.getByLabelText(/^Method/) as HTMLSelectElement;
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

describe("FilesystemExporterEditModal", () => {
  it("prefills the name, path and method", () => {
    renderModal();

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("mirror");
    expect((screen.getByLabelText(/^Path/) as HTMLInputElement).value).toBe(
      "/var/lib/pulp/exports/mirror"
    );
    expect(methodSelect().value).toBe("hardlink");
  });

  it("sends only the fields that changed", async () => {
    updateMock.mockResolvedValue({ ok: true });
    renderModal();
    fireEvent.change(methodSelect(), { target: { value: "symlink" } });
    save();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(exporter.pulp_href, { method: "symlink" });
  });

  it("trims the name and path before comparing and sending", async () => {
    updateMock.mockResolvedValue({ ok: true });
    renderModal();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " mirror-2 " } });
    fireEvent.change(screen.getByLabelText(/^Path/), { target: { value: " /var/lib/pulp/exports/two " } });
    save();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledWith(exporter.pulp_href, {
      name: "mirror-2",
      path: "/var/lib/pulp/exports/two",
    });
  });

  it("does not call Pulp when nothing changed", () => {
    renderModal();
    save();

    expect(screen.getByRole("alert").textContent).toBe("Nothing has changed.");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("requires a name and a path", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "" } });
    save();
    expect(screen.getByRole("alert").textContent).toBe("Name is required.");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "mirror" } });
    fireEvent.change(screen.getByLabelText(/^Path/), { target: { value: " " } });
    save();
    expect(screen.getByRole("alert").textContent).toBe("Path is required.");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("shows Pulp's error text as returned when the update fails, and stays open", async () => {
    updateMock.mockResolvedValue({ ok: false, detail: "path: not an allowed export path" });
    renderModal();
    fireEvent.change(screen.getByLabelText(/^Path/), { target: { value: "/tmp/x" } });
    save();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("path: not an allowed export path");
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
