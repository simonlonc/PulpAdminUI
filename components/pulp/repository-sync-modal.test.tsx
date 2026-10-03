// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RepositorySyncModal } from "@/components/pulp/repository-sync-modal";
import { PULP_PLUGINS } from "@/lib/pulp-plugins";
import type { PulpRemote, PulpRepository } from "@/services/pulp/types";

const file = PULP_PLUGINS.find((plugin) => plugin.kind === "file")!;

const { setErrorMock, listMock, updateMock, syncMock } = vi.hoisted(() => ({
  setErrorMock: vi.fn(),
  listMock: vi.fn(),
  updateMock: vi.fn(),
  syncMock: vi.fn(),
}));

vi.mock("@/components/pulp/auth-context", () => ({
  usePulpAuthContext: () => ({ setError: setErrorMock }),
}));
vi.mock("@/components/pulp/plugins-context", () => ({
  usePulpPluginsContext: () => ({ getPlugin: () => file }),
}));
vi.mock("@/services/pulp/remote-service", () => ({
  pulpRemoteService: { list: listMock, update: updateMock },
}));
vi.mock("@/services/pulp/repository-management-service", () => ({
  pulpRepositoryManagementService: { sync: syncMock },
}));

const REMOTE_A = "/pulp/api/v3/remotes/file/file/a/";
const REMOTE_B = "/pulp/api/v3/remotes/file/file/b/";

function remote(href: string, name: string, concurrency: number | null, rate: number | null) {
  return {
    pulp_href: href,
    name,
    url: `https://example.com/${name}`,
    download_concurrency: concurrency,
    rate_limit: rate,
  } as PulpRemote;
}

const repo = { pulp_href: "/pulp/api/v3/repositories/file/file/r/", name: "repo" } as PulpRepository;

const onSynced = vi.fn();

beforeEach(() => {
  listMock.mockResolvedValue({
    results: [remote(REMOTE_A, "a", 5, null), remote(REMOTE_B, "b", null, 100)],
  });
  updateMock.mockResolvedValue({ ok: true });
  syncMock.mockResolvedValue({ ok: true, data: { task: "/pulp/api/v3/tasks/t/" } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderModal() {
  const view = render(
    <RepositorySyncModal
      repo={repo}
      kind="file"
      onClose={() => {}}
      onSynced={onSynced}
      onBusyChange={() => {}}
    />
  );
  await waitFor(() => expect(screen.getByText(/^a — /)).toBeTruthy());
  return view;
}

function selectRemote(href: string) {
  fireEvent.change(screen.getByRole("combobox", { name: /remote/i }), { target: { value: href } });
}

const concurrencyInput = () => screen.getByLabelText(/Download concurrency/) as HTMLInputElement;
const rateInput = () => screen.getByLabelText(/Rate limit/) as HTMLInputElement;
const start = () => fireEvent.click(screen.getByRole("button", { name: "Start sync" }));

describe("RepositorySyncModal concurrency", () => {
  it("pre-fills from the selected remote, blank for null, and follows a change of remote", async () => {
    await renderModal();
    selectRemote(REMOTE_A);
    expect(concurrencyInput().value).toBe("5");
    expect(rateInput().value).toBe("");
    expect(rateInput().placeholder).toBe("Pulp default");
    selectRemote(REMOTE_B);
    expect(concurrencyInput().value).toBe("");
    expect(rateInput().value).toBe("100");
  });

  it("says the remote changes for every future sync and not the number of syncs at once", async () => {
    await renderModal();
    expect(screen.getByText(/for every future sync/)).toBeTruthy();
    expect(screen.getByText(/do not control how many syncs run at once/)).toBeTruthy();
  });

  it("does not PATCH the remote when nothing changed", async () => {
    await renderModal();
    selectRemote(REMOTE_A);
    start();
    await waitFor(() => expect(syncMock).toHaveBeenCalled());
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("PATCHes only the changed field, then syncs", async () => {
    await renderModal();
    selectRemote(REMOTE_A);
    fireEvent.change(concurrencyInput(), { target: { value: "7" } });
    start();
    await waitFor(() => expect(syncMock).toHaveBeenCalled());
    expect(updateMock).toHaveBeenCalledWith("file", REMOTE_A, { download_concurrency: 7 });
    expect(updateMock.mock.invocationCallOrder[0]).toBeLessThan(syncMock.mock.invocationCallOrder[0]);
    expect(onSynced).toHaveBeenCalledWith({ repoName: "repo", task: "/pulp/api/v3/tasks/t/" });
  });

  it("sends both fields when both changed", async () => {
    await renderModal();
    selectRemote(REMOTE_A);
    fireEvent.change(concurrencyInput(), { target: { value: "2" } });
    fireEvent.change(rateInput(), { target: { value: "50" } });
    start();
    await waitFor(() => expect(syncMock).toHaveBeenCalled());
    expect(updateMock).toHaveBeenCalledWith("file", REMOTE_A, {
      download_concurrency: 2,
      rate_limit: 50,
    });
  });

  it("does not sync when the PATCH fails", async () => {
    updateMock.mockResolvedValue({ ok: false, detail: "boom" });
    await renderModal();
    selectRemote(REMOTE_A);
    fireEvent.change(concurrencyInput(), { target: { value: "7" } });
    start();
    await waitFor(() =>
      expect(setErrorMock).toHaveBeenLastCalledWith(expect.stringContaining("boom"))
    );
    expect(setErrorMock).toHaveBeenLastCalledWith(expect.stringContaining("no sync was started"));
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("reports the remote as updated when the sync fails after the PATCH", async () => {
    syncMock.mockResolvedValue({ ok: false, detail: "no workers" });
    await renderModal();
    selectRemote(REMOTE_A);
    fireEvent.change(concurrencyInput(), { target: { value: "7" } });
    start();
    await waitFor(() =>
      expect(setErrorMock).toHaveBeenLastCalledWith(expect.stringContaining("was updated"))
    );
    expect(setErrorMock).toHaveBeenLastCalledWith(expect.stringContaining("no workers"));
    expect(onSynced).not.toHaveBeenCalled();
  });

  it.each([
    ["download concurrency", "0", "Download concurrency must be a whole number of at least 1."],
    ["download concurrency", "abc", "Download concurrency must be a whole number of at least 1."],
  ])("blocks invalid %s input %s", async (_name, text, message) => {
    await renderModal();
    selectRemote(REMOTE_A);
    fireEvent.change(concurrencyInput(), { target: { value: text } });
    start();
    await waitFor(() => expect(setErrorMock).toHaveBeenLastCalledWith(message));
    expect(updateMock).not.toHaveBeenCalled();
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("blocks an invalid rate limit", async () => {
    await renderModal();
    selectRemote(REMOTE_A);
    fireEvent.change(rateInput(), { target: { value: "1.5" } });
    start();
    await waitFor(() =>
      expect(setErrorMock).toHaveBeenLastCalledWith(expect.stringContaining("Rate limit must be"))
    );
    expect(updateMock).not.toHaveBeenCalled();
    expect(syncMock).not.toHaveBeenCalled();
  });
});
