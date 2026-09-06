import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodePulpAuth } from "@/lib/pulp";

const { cookieState, deleteCookieMock } = vi.hoisted(() => ({
  cookieState: { value: undefined as string | undefined },
  deleteCookieMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieState.value === undefined ? undefined : { name, value: cookieState.value },
    delete: (name: string) => {
      deleteCookieMock(name);
      cookieState.value = undefined;
    },
    set: () => {},
  }),
}));

import { GET } from "@/app/api/pulp/repositories/[kind]/route";

function paramsFor(kind: string) {
  return { params: Promise.resolve({ kind }) };
}

// getPulpPluginRegistry (lib/pulp-plugin-registry.ts) fetches /docs/api.json and falls back,
// uncached, to the curated PULP_PLUGINS on a non-ok response -- see that module's comments.
// Failing that request on every test keeps the fallback (with its known "rpm" family) in play
// without needing a real OpenAPI document, and, since the fallback path is never cached, avoids
// module-level cross-test cache state entirely.
function fetchImpl(listResponse: () => Response) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/docs/api.json")) {
      return new Response("", { status: 500 });
    }
    return listResponse();
  });
}

describe("GET /api/pulp/repositories/[kind]", () => {
  let fetchMock: ReturnType<typeof fetchImpl>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    deleteCookieMock.mockClear();
    fetchMock = fetchImpl(
      () => new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function lastListCallUrl(): URL {
    const call = fetchMock.mock.calls.find(([input]) => {
      const url = String(input instanceof Request ? input.url : input);
      return url.includes("/repositories/rpm/rpm/");
    });
    if (!call) throw new Error("no call to the repository list endpoint");
    return new URL(String(call[0] instanceof Request ? call[0].url : call[0]));
  }

  it("defaults limit to 200 and offset to 0, dropping an unlisted param", async () => {
    const request = new Request("http://pulp.test/api/pulp/repositories/rpm?arbitrary=1");

    await GET(request, paramsFor("rpm"));

    const calledUrl = lastListCallUrl();
    expect(calledUrl.searchParams.get("limit")).toBe("200");
    expect(calledUrl.searchParams.get("offset")).toBe("0");
    expect(calledUrl.searchParams.has("arbitrary")).toBe(false);
  });

  it("forwards limit, offset and the remote extra param", async () => {
    const request = new Request(
      "http://pulp.test/api/pulp/repositories/rpm?limit=10&offset=20&remote=/remotes/rpm/rpm/abc/"
    );

    await GET(request, paramsFor("rpm"));

    const calledUrl = lastListCallUrl();
    expect(calledUrl.searchParams.get("limit")).toBe("10");
    expect(calledUrl.searchParams.get("offset")).toBe("20");
    expect(calledUrl.searchParams.get("remote")).toBe("/remotes/rpm/rpm/abc/");
  });

  it("returns 400 for an unknown repository kind without calling the list endpoint", async () => {
    const request = new Request("http://pulp.test/api/pulp/repositories/bogus");

    const response = await GET(request, paramsFor("bogus"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "Unknown repository kind: bogus" });
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input instanceof Request ? input.url : input).includes("/repositories/")
      )
    ).toBe(false);
  });

  it("surfaces a field-keyed Pulp 400 body from the list endpoint as a readable detail", async () => {
    fetchMock = fetchImpl(() => new Response(JSON.stringify({ name: ["Invalid filter."] }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://pulp.test/api/pulp/repositories/rpm"), paramsFor("rpm"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "name: Invalid filter." });
  });

  it("deletes the auth cookie when the list endpoint returns 403", async () => {
    fetchMock = fetchImpl(() => new Response(JSON.stringify({ detail: "Forbidden." }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://pulp.test/api/pulp/repositories/rpm"), paramsFor("rpm"));

    expect(response.status).toBe(403);
    expect(deleteCookieMock).toHaveBeenCalledWith("pulp_auth");
  });
});
