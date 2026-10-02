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

import { GET } from "@/app/api/pulp/repositories/[kind]/versions/route";

function paramsFor(kind: string) {
  return { params: Promise.resolve({ kind }) };
}

// Same fallback as app/api/pulp/repositories/[kind]/route.test.ts: failing the /docs/api.json
// request keeps getPulpPluginRegistry on its curated PULP_PLUGINS fallback (with its known "rpm"
// family) without a real OpenAPI document.
function fetchImpl(listResponse: () => Response) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/docs/api.json")) {
      return new Response("", { status: 500 });
    }
    return listResponse();
  });
}

const REPO_HREF = "/pulp/api/v3/repositories/rpm/rpm/abc/";

describe("GET /api/pulp/repositories/[kind]/versions response-shape guard (F-16)", () => {
  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    deleteCookieMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns a 502 with a detail, not a TypeError, when Pulp's 200 body is a bare number", async () => {
    vi.stubGlobal("fetch", fetchImpl(() => new Response("42", { status: 200 })));

    const request = new Request(
      `http://pulp.test/api/pulp/repositories/rpm/versions?pulp_href=${encodeURIComponent(REPO_HREF)}`
    );
    const response = await GET(request, paramsFor("rpm"));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("returns a 502 with a detail, not a TypeError, when Pulp's 200 body has no results array", async () => {
    vi.stubGlobal("fetch", fetchImpl(() => new Response("{}", { status: 200 })));

    const request = new Request(
      `http://pulp.test/api/pulp/repositories/rpm/versions?pulp_href=${encodeURIComponent(REPO_HREF)}`
    );
    const response = await GET(request, paramsFor("rpm"));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("stops paginating instead of throwing when a page's next is wrong-typed (extractNextApiPath)", async () => {
    const fetchMock = fetchImpl(
      () =>
        new Response(
          JSON.stringify({ count: 1, next: 42, previous: null, results: [{ number: 1 }] }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request(
      `http://pulp.test/api/pulp/repositories/rpm/versions?pulp_href=${encodeURIComponent(REPO_HREF)}`
    );
    const response = await GET(request, paramsFor("rpm"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.count).toBe(1);
    // One call to resolve the plugin registry's /docs/api.json fallback does not hit the
    // versions list endpoint, so exactly one of fetchMock's calls is the list page itself;
    // a second list call would mean extractNextApiPath treated the wrong-typed `next: 42` as
    // a real next page instead of stopping.
    const listCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input instanceof Request ? input.url : input).includes("/versions/")
    );
    expect(listCalls.length).toBe(1);
  });
});
