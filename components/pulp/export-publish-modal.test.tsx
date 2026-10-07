// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExportPublishModal } from "@/components/pulp/export-publish-modal";
import type { PulpRepositoryOption } from "@/components/pulp/use-pulp-repository-options";
import type { PulpExport } from "@/services/pulp/types";

const { getPublishFilesMock, publishFileMock } = vi.hoisted(() => ({
  getPublishFilesMock: vi.fn(),
  publishFileMock: vi.fn(),
}));

vi.mock("@/services/pulp/export-service", () => ({
  pulpExportService: { getPublishFiles: getPublishFilesMock, publishFile: publishFileMock },
}));

const EXPORT_HREF = "/pulp/api/v3/exporters/core/pulp/e/exports/x/";
const FILES_REPO = "/pulp/api/v3/repositories/file/file/f1/";
const OTHER_FILES_REPO = "/pulp/api/v3/repositories/file/file/f2/";
const RPM_REPO = "/pulp/api/v3/repositories/rpm/rpm/r1/";
const TAR = "/var/lib/pulp/exports/aa-test/export-x.tar";
const TOC = "/var/lib/pulp/exports/aa-test/export-x-toc.json";
const SHA256 = "c8e8a7ff309aff3d5a23c97ea623cb95de7c362ee59d3aa00b7d65b750632f55";
const TAR_URL = "http://files.test:8099/aa-test/export-x.tar";
const TOC_URL = "http://files.test:8099/aa-test/export-x-toc.json";

const exportRow = {
  pulp_href: EXPORT_HREF,
  output_file_info: { [TAR]: "2e1a1f6d", [TOC]: SHA256 },
  toc_info: { file: TOC, sha256: SHA256 },
} as unknown as PulpExport;

const repositoryOptions: PulpRepositoryOption[] = [
  { href: RPM_REPO, name: "aa-rpm", kind: "rpm", latestVersionHref: null },
  { href: FILES_REPO, name: "aa-files", kind: "file", latestVersionHref: null },
  { href: OTHER_FILES_REPO, name: "aa-more-files", kind: "file", latestVersionHref: null },
];

const onClose = vi.fn();

function renderModal(options: PulpRepositoryOption[] = repositoryOptions) {
  render(<ExportPublishModal exportRow={exportRow} repositoryOptions={options} onClose={onClose} />);
  return screen.findByRole("list", { name: "Files to publish" });
}

const urlInput = (basename: string) =>
  screen.getByLabelText(`File URL for ${basename}`) as HTMLInputElement;
const fileBox = (basename: string) =>
  screen.getByRole("checkbox", { name: new RegExp(basename.replace(/\./g, "\\.")) }) as HTMLInputElement;
const repositorySelect = () => screen.getByLabelText(/^Repository/) as HTMLSelectElement;
const publish = () => fireEvent.click(screen.getByRole("button", { name: "Publish" }));

beforeEach(() => {
  getPublishFilesMock.mockResolvedValue({
    configured: true,
    files: [
      { path: TAR, checksum: "2e1a1f6d", file_url: TAR_URL },
      { path: TOC, checksum: SHA256, file_url: TOC_URL },
    ],
  });
  publishFileMock.mockResolvedValue({ ok: true, data: { task: "/pulp/api/v3/tasks/t1/" } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ExportPublishModal", () => {
  it("lists every file with its TOC badge, checksum algorithm and a pre-filled url", async () => {
    const list = await renderModal();

    expect(getPublishFilesMock).toHaveBeenCalledWith(EXPORT_HREF);
    const [tarRow, tocRow] = within(list).getAllByRole("listitem");
    expect(within(tarRow).getByText("export-x.tar")).toBeTruthy();
    expect(within(tarRow).queryByText("TOC")).toBeNull();
    expect(within(tarRow).getByText("crc32")).toBeTruthy();
    expect(within(tarRow).getByText("2e1a1f6d", { exact: false })).toBeTruthy();
    expect(within(tocRow).getByText("export-x-toc.json")).toBeTruthy();
    expect(within(tocRow).getByText("TOC")).toBeTruthy();
    expect(within(tocRow).getByText("sha256")).toBeTruthy();
    expect(within(tocRow).getByText(SHA256, { exact: false })).toBeTruthy();
    expect(fileBox("export-x.tar").checked).toBe(true);
    expect(fileBox("export-x-toc.json").checked).toBe(true);
    expect(urlInput("export-x.tar").value).toBe(TAR_URL);
    expect(urlInput("export-x-toc.json").value).toBe(TOC_URL);
    expect(screen.queryByText(/does not know where the export directory is served/)).toBeNull();
  });

  it("leaves the urls empty and names both variables when the export HTTP server is not configured", async () => {
    getPublishFilesMock.mockResolvedValue({
      configured: false,
      files: [
        { path: TAR, checksum: "2e1a1f6d", file_url: null },
        { path: TOC, checksum: SHA256, file_url: null },
      ],
    });
    await renderModal();

    expect(urlInput("export-x.tar").value).toBe("");
    expect(urlInput("export-x-toc.json").value).toBe("");
    const hint = screen.getByText(/does not know where the export directory is served/);
    expect(hint.textContent).toContain("PULP_EXPORT_HTTP_BASE_URL");
    expect(hint.textContent).toContain("PULP_EXPORT_HTTP_PATH_PREFIX");
    expect(hint.textContent).toContain("this app's server");
  });

  it("says who downloads the url and how to compare the checksums", async () => {
    await renderModal();

    expect(
      screen.getByText(/downloaded by the Pulp worker, not by this browser or this app/).textContent
    ).toContain("outside this app");
    expect(screen.getByText(/compare the content unit's sha256 with the TOC's sha256/).textContent).toContain(
      "crc32"
    );
  });

  it("offers only the File repositories", async () => {
    await renderModal();

    const options = within(repositorySelect()).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Select a File repository",
      "aa-files",
      "aa-more-files",
    ]);
    expect(screen.queryByText(/no File repositories/)).toBeNull();
  });

  it("hints at creating one when there is no File repository", async () => {
    await renderModal([repositoryOptions[0]]);

    expect(screen.getByText(/There are no File repositories yet/)).toBeTruthy();
    expect(within(repositorySelect()).getAllByRole("option")).toHaveLength(1);
  });

  it("dispatches one publishFile per checked file, in order and one at a time, with the edited url", async () => {
    const resolvers: ((value: unknown) => void)[] = [];
    publishFileMock.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve))
    );
    await renderModal();
    fireEvent.change(repositorySelect(), { target: { value: FILES_REPO } });
    fireEvent.change(urlInput("export-x.tar"), { target: { value: "  http://mirror.test/edited.tar " } });
    publish();

    await waitFor(() => expect(publishFileMock).toHaveBeenCalledTimes(1));
    expect(publishFileMock).toHaveBeenNthCalledWith(1, EXPORT_HREF, {
      path: TAR,
      repository: FILES_REPO,
      file_url: "http://mirror.test/edited.tar",
    });
    // The second dispatch waits for the first answer.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(publishFileMock).toHaveBeenCalledTimes(1);

    resolvers[0]({ ok: true, data: { task: "/pulp/api/v3/tasks/t1/" } });
    await waitFor(() => expect(publishFileMock).toHaveBeenCalledTimes(2));
    expect(publishFileMock).toHaveBeenNthCalledWith(2, EXPORT_HREF, {
      path: TOC,
      repository: FILES_REPO,
      file_url: TOC_URL,
    });
    resolvers[1]({ ok: true, data: { task: "/pulp/api/v3/tasks/t2/" } });

    await screen.findByRole("list", { name: "Publish results" });
  });

  it("skips a file that is unchecked", async () => {
    await renderModal();
    fireEvent.change(repositorySelect(), { target: { value: FILES_REPO } });
    fireEvent.click(fileBox("export-x.tar"));
    publish();

    await screen.findByRole("list", { name: "Publish results" });
    expect(publishFileMock).toHaveBeenCalledTimes(1);
    expect(publishFileMock.mock.calls[0][1].path).toBe(TOC);
  });

  it("lists a task link for a success and Pulp's message for a failure, hiding neither", async () => {
    publishFileMock
      .mockResolvedValueOnce({ ok: false, detail: "file_url: Enter a valid URL." })
      .mockResolvedValueOnce({ ok: true, data: { task: "/pulp/api/v3/tasks/t2/" } });
    await renderModal();
    fireEvent.change(repositorySelect(), { target: { value: FILES_REPO } });
    publish();

    const results = await screen.findByRole("list", { name: "Publish results" });
    const [failed, succeeded] = within(results).getAllByRole("listitem");
    expect(within(failed).getByText("export-x.tar")).toBeTruthy();
    expect(within(failed).getByText("file_url: Enter a valid URL.")).toBeTruthy();
    expect(within(failed).queryByRole("link")).toBeNull();
    expect(within(succeeded).getByText("export-x-toc.json")).toBeTruthy();
    expect(
      within(succeeded).getByRole("link", { name: "/pulp/api/v3/tasks/t2/" }).getAttribute("href")
    ).toBe(`/tasks/detail?pulp_href=${encodeURIComponent("/pulp/api/v3/tasks/t2/")}`);
    expect(screen.getByText(/Pulp reports that as the task's failure/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
  });

  it("keeps going after a request that throws, and reports its message", async () => {
    publishFileMock
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValueOnce({ ok: true, data: { task: "/pulp/api/v3/tasks/t2/" } });
    await renderModal();
    fireEvent.change(repositorySelect(), { target: { value: FILES_REPO } });
    publish();

    const results = await screen.findByRole("list", { name: "Publish results" });
    expect(within(results).getByText("Network down")).toBeTruthy();
    expect(within(results).getByRole("link", { name: "/pulp/api/v3/tasks/t2/" })).toBeTruthy();
    expect(publishFileMock).toHaveBeenCalledTimes(2);
  });

  describe("validation", () => {
    it("blocks submit until a repository is chosen", async () => {
      await renderModal();
      publish();

      expect((await screen.findByRole("alert")).textContent).toBe("Choose a File repository.");
      expect(publishFileMock).not.toHaveBeenCalled();
    });

    it("blocks submit when no file is checked", async () => {
      await renderModal();
      fireEvent.change(repositorySelect(), { target: { value: FILES_REPO } });
      fireEvent.click(fileBox("export-x.tar"));
      fireEvent.click(fileBox("export-x-toc.json"));
      publish();

      expect((await screen.findByRole("alert")).textContent).toBe("Check at least one file to publish.");
      expect(publishFileMock).not.toHaveBeenCalled();
    });

    it("blocks submit when a checked file has an empty url, but not when only an unchecked one has", async () => {
      await renderModal();
      fireEvent.change(repositorySelect(), { target: { value: FILES_REPO } });
      fireEvent.change(urlInput("export-x.tar"), { target: { value: "   " } });
      publish();

      expect((await screen.findByRole("alert")).textContent).toBe("Every checked file needs a file URL.");
      expect(publishFileMock).not.toHaveBeenCalled();

      fireEvent.click(fileBox("export-x.tar"));
      publish();

      await screen.findByRole("list", { name: "Publish results" });
      expect(publishFileMock).toHaveBeenCalledTimes(1);
    });
  });

  it("shows the load error and offers only Close", async () => {
    getPublishFilesMock.mockRejectedValue(new Error("Not found."));
    render(<ExportPublishModal exportRow={exportRow} repositoryOptions={repositoryOptions} onClose={onClose} />);

    expect((await screen.findByRole("alert")).textContent).toBe("Not found.");
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Files to publish" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from Cancel and Escape", async () => {
    await renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
