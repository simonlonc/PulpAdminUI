// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExporterEditModal } from "@/components/pulp/exporter-edit-modal";
import type { PulpRepositoryOption } from "@/components/pulp/use-pulp-repository-options";
import type { PulpExporter } from "@/services/pulp/types";

const { updateMock } = vi.hoisted(() => ({ updateMock: vi.fn() }));

vi.mock("@/services/pulp/export-service", () => ({
  pulpExportService: { update: updateMock },
}));

const REPO_A = "/pulp/api/v3/repositories/file/file/a/";
const REPO_B = "/pulp/api/v3/repositories/rpm/rpm/b/";
const REPO_BEYOND_PAGE = "/pulp/api/v3/repositories/rpm/rpm/zzz/";

const repositoryOptions: PulpRepositoryOption[] = [
  { href: REPO_A, name: "alpha", kind: "file", latestVersionHref: null },
  { href: REPO_B, name: "beta", kind: "rpm", latestVersionHref: null },
];

const exporter: PulpExporter = {
  pulp_href: "/pulp/api/v3/exporters/core/pulp/e1/",
  prn: "prn:core.pulpexporter:e1",
  pulp_created: "2026-01-01T00:00:00Z",
  pulp_last_updated: "2026-01-01T00:00:00Z",
  name: "nightly",
  path: "/var/lib/pulp/exports/nightly",
  repositories: [REPO_A, REPO_BEYOND_PAGE],
  last_export: null,
};

const onClose = vi.fn();
const onSaved = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal() {
  return render(
    <ExporterEditModal
      exporter={exporter}
      repositoryOptions={repositoryOptions}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));
const option = (name: string) => screen.getByRole("option", { name }) as HTMLOptionElement;

describe("ExporterEditModal", () => {
  it("prefills the name, path and selected repositories", () => {
    renderModal();

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("nightly");
    expect((screen.getByLabelText(/^Path/) as HTMLInputElement).value).toBe(
      "/var/lib/pulp/exports/nightly"
    );
    expect(option("alpha (FILE)").selected).toBe(true);
    expect(option("beta (RPM)").selected).toBe(false);
  });

  it("keeps a held repository selectable even when it is not among the loaded options", () => {
    renderModal();

    expect(option(REPO_BEYOND_PAGE).selected).toBe(true);
  });

  it("sends only the fields that changed", async () => {
    updateMock.mockResolvedValue({ ok: true });
    renderModal();
    fireEvent.change(screen.getByLabelText(/^Path/), {
      target: { value: " /var/lib/pulp/exports/other " },
    });
    save();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(exporter.pulp_href, {
      path: "/var/lib/pulp/exports/other",
    });
  });

  it("sends the new repository list when the selection changed", async () => {
    updateMock.mockResolvedValue({ ok: true });
    renderModal();
    const beta = option("beta (RPM)");
    beta.selected = true;
    fireEvent.change(beta.closest("select")!);
    save();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledWith(exporter.pulp_href, {
      repositories: [REPO_A, REPO_B, REPO_BEYOND_PAGE],
    });
  });

  it("does not call Pulp when nothing changed", () => {
    renderModal();
    save();

    expect(screen.getByRole("alert").textContent).toBe("Nothing has changed.");
    expect(updateMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("requires a name and a path", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  " } });
    save();
    expect(screen.getByRole("alert").textContent).toBe("Name is required.");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "nightly" } });
    fireEvent.change(screen.getByLabelText(/^Path/), { target: { value: "" } });
    save();
    expect(screen.getByRole("alert").textContent).toBe("Path is required.");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("shows Pulp's error text as returned when the update fails, and stays open", async () => {
    updateMock.mockResolvedValue({
      ok: false,
      detail: "path: Path '/tmp/x' is not an allowed export path",
    });
    renderModal();
    fireEvent.change(screen.getByLabelText(/^Path/), { target: { value: "/tmp/x" } });
    save();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("path: Path '/tmp/x' is not an allowed export path");
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
