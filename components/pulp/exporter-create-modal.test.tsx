// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExporterCreateModal } from "@/components/pulp/exporter-create-modal";
import type { PulpRepositoryOption } from "@/components/pulp/use-pulp-repository-options";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@/services/pulp/export-service", () => ({
  pulpExportService: { create: createMock },
}));

const REPO_A = "/pulp/api/v3/repositories/file/file/a/";
const REPO_B = "/pulp/api/v3/repositories/rpm/rpm/b/";

const repositoryOptions: PulpRepositoryOption[] = [
  { href: REPO_A, name: "alpha", kind: "file", latestVersionHref: null },
  { href: REPO_B, name: "beta", kind: "rpm", latestVersionHref: null },
];

const onClose = vi.fn();
const onCreated = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal() {
  return render(
    <ExporterCreateModal
      repositoryOptions={repositoryOptions}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

function fill(name: string, path: string) {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(/^Path/), { target: { value: path } });
}

const create = () => fireEvent.click(screen.getByRole("button", { name: "Create" }));

describe("ExporterCreateModal", () => {
  it("says the path must sit under ALLOWED_EXPORT_PATHS, a Pulp server setting this app cannot change", () => {
    renderModal();

    expect(screen.getByText(/ALLOWED_EXPORT_PATHS/)).toBeTruthy();
    expect(screen.getByText(/Pulp server setting this app cannot change/)).toBeTruthy();
  });

  it("offers every repository by name and kind", () => {
    renderModal();

    expect(screen.getByRole("option", { name: "alpha (FILE)" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "beta (RPM)" })).toBeTruthy();
  });

  it("says the repositories are loading rather than showing an empty list", () => {
    render(
      <ExporterCreateModal
        repositoryOptions={[]}
        repositoryOptionsLoading
        onClose={onClose}
        onCreated={onCreated}
      />
    );

    expect(screen.getByText("Loading repositories…")).toBeTruthy();
  });

  it("says there are no repositories once loaded empty, and still allows creating", () => {
    render(<ExporterCreateModal repositoryOptions={[]} onClose={onClose} onCreated={onCreated} />);

    expect(screen.getByText(/There are no repositories yet/)).toBeTruthy();
    expect(screen.queryByText("Loading repositories…")).toBeNull();
  });

  it("shows the multi-select hint once repositories are listed", () => {
    renderModal();

    expect(screen.getByText(/Hold Ctrl or Cmd to select several/)).toBeTruthy();
  });

  it("shows Pulp's error text as returned when create fails, and stays open", async () => {
    createMock.mockResolvedValue({
      ok: false,
      detail: "path: Path '/tmp/aa-test' is not an allowed export path",
    });
    renderModal();
    fill("aa-test", "/tmp/aa-test");
    create();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("path: Path '/tmp/aa-test' is not an allowed export path");
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("creates with the trimmed fields and the selected repository hrefs", async () => {
    createMock.mockResolvedValue({ ok: true, data: {} });
    renderModal();
    fill(" aa-test ", " /var/lib/pulp/exports/aa-test ");
    const alpha = screen.getByRole("option", { name: "alpha (FILE)" }) as HTMLOptionElement;
    alpha.selected = true;
    fireEvent.change(alpha.closest("select")!);
    create();

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith({
      name: "aa-test",
      path: "/var/lib/pulp/exports/aa-test",
      repositories: [REPO_A],
    });
  });

  it("allows an empty repository list", async () => {
    createMock.mockResolvedValue({ ok: true, data: {} });
    renderModal();
    fill("aa-test", "/var/lib/pulp/exports/aa-test");
    create();

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0].repositories).toEqual([]);
  });

  it("requires a name and a path before calling Pulp", () => {
    renderModal();
    create();
    expect(screen.getByRole("alert").textContent).toBe("Name is required.");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "aa-test" } });
    create();
    expect(screen.getByRole("alert").textContent).toBe("Path is required.");
    expect(createMock).not.toHaveBeenCalled();
  });
});
