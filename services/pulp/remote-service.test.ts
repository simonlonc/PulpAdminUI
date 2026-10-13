import { afterEach, describe, expect, it, vi } from "vitest";

import { pulpRemoteService } from "@/services/pulp/remote-service";

function remote(index: number) {
  return {
    pulp_href: `/pulp/api/v3/remotes/file/file/${index}/`,
    name: `remote-${index}`,
    url: `https://example.test/${index}`,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pulpRemoteService.listAll", () => {
  it("makes one request and returns the route's rows", async () => {
    const results = [remote(1), remote(2)];
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ count: 2, next: null, previous: null, results }), {
          status: 200,
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const remotes = await pulpRemoteService.listAll();

    expect(remotes).toEqual(results);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/pulp/remotes");
  });

  it("throws the route's detail on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "Not allowed." }), { status: 403 }))
    );

    await expect(pulpRemoteService.listAll()).rejects.toThrow("Not allowed.");
  });
});
