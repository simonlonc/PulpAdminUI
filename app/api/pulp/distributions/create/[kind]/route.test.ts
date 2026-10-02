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

import { POST } from "@/app/api/pulp/distributions/create/[kind]/route";

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

describe("POST /api/pulp/distributions/create/[kind] response-shape guard (F-16)", () => {
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

  function postRequest() {
    return new Request("http://pulp.test/api/pulp/distributions/create/rpm", {
      method: "POST",
      body: JSON.stringify({ repository: REPO_HREF, name: "my-dist", base_path: "my-dist" }),
      headers: { "Content-Type": "application/json" },
    });
  }

  it("surfaces a 502 with a detail, not a TypeError, when the linked-distribution lookup's body is a bare number", async () => {
    vi.stubGlobal("fetch", fetchImpl(() => new Response("42", { status: 200 })));

    const response = await POST(postRequest(), paramsFor("rpm"));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("surfaces a 502 with a detail, not a TypeError, when the linked-distribution lookup's body has no results array", async () => {
    vi.stubGlobal("fetch", fetchImpl(() => new Response("{}", { status: 200 })));

    const response = await POST(postRequest(), paramsFor("rpm"));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });
});
