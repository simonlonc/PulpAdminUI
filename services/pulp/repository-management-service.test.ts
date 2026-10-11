import { afterEach, describe, expect, it, vi } from "vitest";

import { pulpRepositoryManagementService } from "@/services/pulp/repository-management-service";
import type { PulpRepository } from "@/services/pulp/types";

function repo(index: number): PulpRepository {
  return {
    pulp_href: `/pulp/api/v3/repositories/file/file/${index}/`,
    name: `repo-${index}`,
    latest_version_href: null,
    pulp_labels: {},
  };
}

function page(results: PulpRepository[], count: number) {
  return new Response(JSON.stringify({ count, next: null, previous: null, results }), {
    status: 200,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pulpRepositoryManagementService.listAll", () => {
  it("makes one request when the first page holds every repository", async () => {
    const fetchMock = vi.fn(async () => page([repo(1), repo(2)], 2));
    vi.stubGlobal("fetch", fetchMock);

    const repositories = await pulpRepositoryManagementService.listAll();

    expect(repositories.map((r) => r.name)).toEqual(["repo-1", "repo-2"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/pulp/repositories?limit=1000&offset=0");
  });

  it("pages by offset until count rows are in", async () => {
    const first = Array.from({ length: 1000 }, (_, index) => repo(index));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page(first, 1001))
      .mockResolvedValueOnce(page([repo(1000)], 1001));
    vi.stubGlobal("fetch", fetchMock);

    const repositories = await pulpRepositoryManagementService.listAll();

    expect(repositories).toHaveLength(1001);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/pulp/repositories?limit=1000&offset=1000");
  });

  it("stops on an empty page even if count promised more", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page([repo(1)], 5))
      .mockResolvedValueOnce(page([], 5));
    vi.stubGlobal("fetch", fetchMock);

    const repositories = await pulpRepositoryManagementService.listAll();

    expect(repositories).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops after ten pages", async () => {
    const fetchMock = vi.fn(async () => page([repo(1)], 1_000_000));
    vi.stubGlobal("fetch", fetchMock);

    const repositories = await pulpRepositoryManagementService.listAll();

    expect(repositories).toHaveLength(10);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it("throws the route's detail on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "Pulp is down." }), { status: 502 }))
    );

    await expect(pulpRepositoryManagementService.listAll()).rejects.toThrow("Pulp is down.");
  });
});
