import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodePulpAuth } from "@/lib/pulp";

const { cookieState } = vi.hoisted(() => ({
  cookieState: { value: undefined as string | undefined },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieState.value === undefined ? undefined : { name, value: cookieState.value },
    delete: () => {
      cookieState.value = undefined;
    },
    set: () => {},
  }),
}));

import { GET } from "@/app/api/pulp/remotes/route";

function remote(kind: string, id: string, name: string) {
  return {
    pulp_href: `/pulp/api/v3/remotes/${kind}/${kind}/${id}/`,
    name,
    url: `https://example.test/${name}`,
  };
}

const PAGE_ONE = {
  count: 2,
  next: "http://pulp.test/pulp/api/v3/remotes/?fields=pulp_href,name,url&limit=1000&offset=1000",
  previous: null,
  results: [remote("rpm", "a", "epel-10")],
};
const PAGE_TWO = { count: 2, next: null, previous: "x", results: [remote("file", "b", "files")] };

describe("GET /api/pulp/remotes", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function calledUrl(): URL {
    const [input] = fetchMock.mock.calls[0] as [RequestInfo | URL];
    return new URL(String(input instanceof Request ? input.url : input));
  }

  it("walks every page of Pulp's generic /remotes/ list and returns one merged list", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(PAGE_ONE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(PAGE_TWO), { status: 200 }));

    const response = await GET(new Request("http://pulp.test/api/pulp/remotes"), undefined);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      count: 2,
      next: null,
      previous: null,
      results: [remote("rpm", "a", "epel-10"), remote("file", "b", "files")],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calledUrl().pathname).toBe("/pulp/api/v3/remotes/");
    expect(calledUrl().searchParams.get("fields")).toBe("pulp_href,name,url");
    expect(calledUrl().searchParams.get("limit")).toBe("1000");
    const [second] = fetchMock.mock.calls[1] as [RequestInfo | URL];
    const secondUrl = new URL(String(second instanceof Request ? second.url : second));
    expect(secondUrl.searchParams.get("offset")).toBe("1000");
  });

  it("passes a Pulp error status and detail through", async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ detail: "Not allowed." }), { status: 403 })
    );

    const response = await GET(new Request("http://pulp.test/api/pulp/remotes"), undefined);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ detail: "Not allowed." });
  });
});
