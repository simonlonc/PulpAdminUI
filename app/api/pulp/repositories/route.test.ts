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

import { GET } from "@/app/api/pulp/repositories/route";

const LIST_BODY = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      pulp_href: "/pulp/api/v3/repositories/rpm/rpm/a/",
      name: "epel-10",
      latest_version_href: "/pulp/api/v3/repositories/rpm/rpm/a/versions/0/",
      pulp_labels: {},
    },
  ],
};

describe("GET /api/pulp/repositories", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    fetchMock = vi.fn(async () => new Response(JSON.stringify(LIST_BODY), { status: 200 }));
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

  it("lists every kind through Pulp's generic /repositories/ endpoint", async () => {
    const response = await GET(new Request("http://pulp.test/api/pulp/repositories"), undefined);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(LIST_BODY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calledUrl().pathname).toBe("/pulp/api/v3/repositories/");
  });

  it("defaults limit to 200 and offset to 0, forwards both, and drops an unlisted param", async () => {
    await GET(new Request("http://pulp.test/api/pulp/repositories?arbitrary=1"), undefined);
    expect(calledUrl().searchParams.get("limit")).toBe("200");
    expect(calledUrl().searchParams.get("offset")).toBe("0");
    expect(calledUrl().searchParams.has("arbitrary")).toBe(false);

    fetchMock.mockClear();
    await GET(new Request("http://pulp.test/api/pulp/repositories?limit=1000&offset=2000"), undefined);
    expect(calledUrl().searchParams.get("limit")).toBe("1000");
    expect(calledUrl().searchParams.get("offset")).toBe("2000");
  });

  it("passes a Pulp error status and detail through", async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ detail: "Not allowed." }), { status: 403 })
    );

    const response = await GET(new Request("http://pulp.test/api/pulp/repositories"), undefined);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ detail: "Not allowed." });
  });
});
