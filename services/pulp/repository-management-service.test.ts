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
  it("makes one request and returns the route's rows", async () => {
    const fetchMock = vi.fn(async () => page([repo(1), repo(2)], 2));
    vi.stubGlobal("fetch", fetchMock);

    const repositories = await pulpRepositoryManagementService.listAll();

    expect(repositories.map((r) => r.name)).toEqual(["repo-1", "repo-2"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/pulp/repositories");
  });

  it("throws the route's detail on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "Pulp is down." }), { status: 502 }))
    );

    await expect(pulpRepositoryManagementService.listAll()).rejects.toThrow("Pulp is down.");
  });
});
