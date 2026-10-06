// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FilesystemExporterCreateModal } from "@/components/pulp/filesystem-exporter-create-modal";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@/services/pulp/filesystem-export-service", () => ({
  pulpFilesystemExportService: { create: createMock },
}));

const onClose = vi.fn();
const onCreated = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal() {
  return render(<FilesystemExporterCreateModal onClose={onClose} onCreated={onCreated} />);
}

function fill(name: string, path: string) {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(/^Path/), { target: { value: path } });
}

const methodSelect = () => screen.getByLabelText(/^Method/) as HTMLSelectElement;
const create = () => fireEvent.click(screen.getByRole("button", { name: "Create" }));

describe("FilesystemExporterCreateModal", () => {
  it("says the path must sit under ALLOWED_EXPORT_PATHS, a Pulp server setting this app cannot change", () => {
    renderModal();

    expect(screen.getByText(/ALLOWED_EXPORT_PATHS/)).toBeTruthy();
    expect(screen.getByText(/Pulp server setting this app cannot change/)).toBeTruthy();
  });

  it("offers the three methods, defaulting to write", () => {
    renderModal();

    expect(
      Array.from(methodSelect().options, (option) => option.value)
    ).toEqual(["write", "hardlink", "symlink"]);
    expect(methodSelect().value).toBe("write");
  });

  it("shows a one-line hint for the chosen method, and the link methods name the same-filesystem need", () => {
    renderModal();
    expect(screen.getByText("Copies the files into the path.")).toBeTruthy();

    fireEvent.change(methodSelect(), { target: { value: "hardlink" } });
    expect(
      screen.getByText(/Hardlinks the files into the path\. The path must be on the same filesystem as Pulp's artifact storage\./)
    ).toBeTruthy();
    expect(screen.queryByText("Copies the files into the path.")).toBeNull();

    fireEvent.change(methodSelect(), { target: { value: "symlink" } });
    expect(
      screen.getByText(/Symlinks the files into the path\. The path must be on the same filesystem as Pulp's artifact storage\./)
    ).toBeTruthy();
  });

  it("shows Pulp's error text as returned when create fails, and stays open", async () => {
    createMock.mockResolvedValue({
      ok: false,
      detail: "path: Path '/tmp/aa-test-fs' is not an allowed export path",
    });
    renderModal();
    fill("aa-test-fs", "/tmp/aa-test-fs");
    create();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("path: Path '/tmp/aa-test-fs' is not an allowed export path");
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("creates with the trimmed fields and the default write method", async () => {
    createMock.mockResolvedValue({ ok: true, data: {} });
    renderModal();
    fill(" aa-test-fs ", " /var/lib/pulp/exports/aa-test-fs ");
    create();

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith({
      name: "aa-test-fs",
      path: "/var/lib/pulp/exports/aa-test-fs",
      method: "write",
    });
  });

  it("creates with the chosen method", async () => {
    createMock.mockResolvedValue({ ok: true, data: {} });
    renderModal();
    fill("aa-test-fs", "/var/lib/pulp/exports/aa-test-fs");
    fireEvent.change(methodSelect(), { target: { value: "symlink" } });
    create();

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0].method).toBe("symlink");
  });

  it("requires a name and a path before calling Pulp", () => {
    renderModal();
    create();
    expect(screen.getByRole("alert").textContent).toBe("Name is required.");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "aa-test-fs" } });
    create();
    expect(screen.getByRole("alert").textContent).toBe("Path is required.");
    expect(createMock).not.toHaveBeenCalled();
  });
});
