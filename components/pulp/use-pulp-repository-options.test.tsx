// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  findPluginForRepositoryHrefIn,
  PULP_PLUGINS,
  type PulpPluginDescriptor,
} from "@/lib/pulp-plugins";
import { usePulpRepositoryOptions } from "@/components/pulp/use-pulp-repository-options";
import type { PulpRepository } from "@/services/pulp/types";

const { listAllMock, setErrorMock, pluginsState } = vi.hoisted(() => ({
  listAllMock: vi.fn(),
  setErrorMock: vi.fn(),
  pluginsState: {
    findPluginForRepositoryHref: (() => null) as (href: string) => PulpPluginDescriptor | null,
  },
}));

vi.mock("@/services/pulp/repository-management-service", () => ({
  pulpRepositoryManagementService: { listAll: listAllMock },
}));
vi.mock("@/components/pulp/auth-context", () => ({
  usePulpAuthContext: () => ({ setError: setErrorMock }),
}));
vi.mock("@/components/pulp/plugins-context", () => ({
  usePulpPluginsContext: () => pluginsState,
}));

function repo(kindPath: string, id: string, name: string): PulpRepository {
  const href = `/pulp/api/v3/repositories/${kindPath}/${id}/`;
  return { pulp_href: href, name, latest_version_href: `${href}versions/1/`, pulp_labels: {} };
}

const RPM_REPO = repo("rpm/rpm", "a", "test");
const FILE_REPO = repo("file/file", "b", "epel-10");
const CONTAINER_REPO = repo("container/container", "c", "images");

function finderFor(plugins: readonly PulpPluginDescriptor[]) {
  return (href: string) => findPluginForRepositoryHrefIn(plugins, href);
}

beforeEach(() => {
  pluginsState.findPluginForRepositoryHref = finderFor(PULP_PLUGINS);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("usePulpRepositoryOptions", () => {
  it("loads every kind in one call and returns name-sorted options with their kind", async () => {
    listAllMock.mockResolvedValue([RPM_REPO, FILE_REPO]);

    const { result } = renderHook(() => usePulpRepositoryOptions(true));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.repositoryOptions).toEqual([]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(listAllMock).toHaveBeenCalledTimes(1);
    expect(result.current.repositoryOptions).toEqual([
      {
        href: FILE_REPO.pulp_href,
        name: "epel-10",
        kind: "file",
        latestVersionHref: FILE_REPO.latest_version_href,
      },
      {
        href: RPM_REPO.pulp_href,
        name: "test",
        kind: "rpm",
        latestVersionHref: RPM_REPO.latest_version_href,
      },
    ]);
  });

  it("leaves out a kind the registry does not know, and adds it when the registry grows, without refetching", async () => {
    listAllMock.mockResolvedValue([RPM_REPO, CONTAINER_REPO]);

    const { result, rerender } = renderHook(() => usePulpRepositoryOptions(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.repositoryOptions.map((option) => option.name)).toEqual(["test"]);

    const container = {
      ...PULP_PLUGINS[0],
      kind: "container",
      repositoryPath: "/repositories/container/container/",
    } as PulpPluginDescriptor;
    pluginsState.findPluginForRepositoryHref = finderFor([...PULP_PLUGINS, container]);
    rerender();

    expect(result.current.repositoryOptions.map((option) => option.name)).toEqual(["images", "test"]);
    expect(listAllMock).toHaveBeenCalledTimes(1);
  });

  it("does not load while disabled", () => {
    const { result } = renderHook(() => usePulpRepositoryOptions(false));

    expect(listAllMock).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.repositoryOptions).toEqual([]);
  });

  it("reports a failed load and stops loading with no options", async () => {
    listAllMock.mockRejectedValue(new Error("Pulp is down."));

    const { result } = renderHook(() => usePulpRepositoryOptions(true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(setErrorMock).toHaveBeenCalledWith("Pulp is down.");
    expect(result.current.repositoryOptions).toEqual([]);
  });
});
