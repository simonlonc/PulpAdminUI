// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FilesystemExportRunModal } from "@/components/pulp/filesystem-export-run-modal";
import type { PulpPublicationOption } from "@/components/pulp/use-pulp-publication-options";
import type { PulpRepositoryOption } from "@/components/pulp/use-pulp-repository-options";
import type { PulpFilesystemExporter } from "@/services/pulp/types";

const EXPORTER_HREF = "/pulp/api/v3/exporters/core/filesystem/e/";
const TASK_HREF = "/pulp/api/v3/tasks/t/";
const PUBLICATION_HREF = "/pulp/api/v3/publications/file/file/p/";
const REPO_VERSIONED = "/pulp/api/v3/repositories/file/file/a/";
const REPO_VERSION_HREF = `${REPO_VERSIONED}versions/3/`;
const REPO_EMPTY = "/pulp/api/v3/repositories/rpm/rpm/b/";

const { runExportMock, repositoryOptions, publicationOptions } = vi.hoisted(() => ({
  runExportMock: vi.fn(),
  repositoryOptions: [] as PulpRepositoryOption[],
  publicationOptions: [] as PulpPublicationOption[],
}));

vi.mock("@/services/pulp/filesystem-export-service", () => ({
  pulpFilesystemExportService: { runExport: runExportMock },
}));
vi.mock("@/components/pulp/use-pulp-repository-options", () => ({
  usePulpRepositoryOptions: () => ({ repositoryOptions }),
}));
vi.mock("@/components/pulp/use-pulp-publication-options", () => ({
  usePulpPublicationOptions: () => ({ publicationOptions }),
}));

const exporter = {
  pulp_href: EXPORTER_HREF,
  name: "aa-test-fs",
  path: "/var/lib/pulp/exports/aa-test-fs",
  method: "hardlink",
} as PulpFilesystemExporter;

const onClose = vi.fn();

beforeEach(() => {
  repositoryOptions.splice(
    0,
    repositoryOptions.length,
    { href: REPO_VERSIONED, name: "alpha", kind: "file", latestVersionHref: REPO_VERSION_HREF },
    { href: REPO_EMPTY, name: "beta", kind: "rpm", latestVersionHref: null }
  );
  publicationOptions.splice(0, publicationOptions.length, {
    href: PUBLICATION_HREF,
    label: "alpha v3 (2026-10-06T21:00:00Z)",
  });
  runExportMock.mockResolvedValue({ ok: true, data: { task: TASK_HREF } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const sourceSelect = () => screen.getByLabelText(/^Source/) as HTMLSelectElement;
const publicationSelect = () => screen.getByLabelText(/^Publication/) as HTMLSelectElement;
const repositorySelect = () => screen.getByLabelText(/^Repository/) as HTMLSelectElement;
const run = () => fireEvent.click(screen.getByRole("button", { name: "Run export" }));

describe("FilesystemExportRunModal", () => {
  it("offers only the publication and repository version sources, starting on publication", () => {
    render(<FilesystemExportRunModal exporter={exporter} onClose={onClose} />);

    expect(Array.from(sourceSelect().options, (option) => option.text)).toEqual([
      "Publication",
      "Repository version",
    ]);
    expect(sourceSelect().value).toBe("publication");
    expect(screen.getByRole("option", { name: "alpha v3 (2026-10-06T21:00:00Z)" })).toBeTruthy();
    expect(screen.queryByLabelText(/start/i)).toBeNull();
  });

  it("sends {publication} for the publication source", async () => {
    render(<FilesystemExportRunModal exporter={exporter} onClose={onClose} />);
    fireEvent.change(publicationSelect(), { target: { value: PUBLICATION_HREF } });
    run();

    await waitFor(() => expect(runExportMock).toHaveBeenCalledTimes(1));
    expect(runExportMock).toHaveBeenCalledWith(EXPORTER_HREF, { publication: PUBLICATION_HREF });
  });

  it("sends the repository's latestVersionHref as {repository_version} for the repository source", async () => {
    render(<FilesystemExportRunModal exporter={exporter} onClose={onClose} />);
    fireEvent.change(sourceSelect(), { target: { value: "repository_version" } });
    fireEvent.change(repositorySelect(), { target: { value: REPO_VERSIONED } });
    run();

    await waitFor(() => expect(runExportMock).toHaveBeenCalledTimes(1));
    expect(runExportMock).toHaveBeenCalledWith(EXPORTER_HREF, { repository_version: REPO_VERSION_HREF });
  });

  it("disables a repository that has no versions", () => {
    render(<FilesystemExportRunModal exporter={exporter} onClose={onClose} />);
    fireEvent.change(sourceSelect(), { target: { value: "repository_version" } });

    expect((screen.getByRole("option", { name: "alpha (FILE)" }) as HTMLOptionElement).disabled).toBe(false);
    expect(
      (screen.getByRole("option", { name: "beta (RPM, no versions)" }) as HTMLOptionElement).disabled
    ).toBe(true);
  });

  it("asks for a source before calling Pulp", () => {
    render(<FilesystemExportRunModal exporter={exporter} onClose={onClose} />);
    run();
    expect(screen.getByRole("alert").textContent).toBe("Select a publication.");

    fireEvent.change(sourceSelect(), { target: { value: "repository_version" } });
    run();
    expect(screen.getByRole("alert").textContent).toBe("Select a repository that has a version.");
    expect(runExportMock).not.toHaveBeenCalled();
  });

  it("links to the dispatched task without waiting on it, and reports the dispatch on close", async () => {
    render(<FilesystemExportRunModal exporter={exporter} onClose={onClose} />);
    fireEvent.change(publicationSelect(), { target: { value: PUBLICATION_HREF } });
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
      detail: "publication: Invalid hyperlink - Object does not exist.",
    });
    render(<FilesystemExportRunModal exporter={exporter} onClose={onClose} />);
    fireEvent.change(publicationSelect(), { target: { value: PUBLICATION_HREF } });
    run();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("publication: Invalid hyperlink - Object does not exist.");
    expect(screen.queryByRole("link")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledWith(false);
  });
});
