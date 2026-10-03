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

import { POST } from "@/app/api/pulp/repositories/[kind]/modify/route";

function paramsFor(kind: string) {
  return { params: Promise.resolve({ kind }) };
}

// Same fallback as app/api/pulp/repositories/[kind]/route.test.ts: failing the /docs/api.json
// request keeps getPulpPluginRegistry on its curated PULP_PLUGINS fallback (with its known "rpm"
// family) without a real OpenAPI document.
function fetchImpl(modifyResponse: () => Response) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/docs/api.json")) {
      return new Response("", { status: 500 });
    }
    return modifyResponse();
  });
}

const REPO_HREF = "/pulp/api/v3/repositories/rpm/rpm/abc/";

function postRequest(body: unknown) {
  return new Request("http://pulp.test/api/pulp/repositories/rpm/modify", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/pulp/repositories/[kind]/modify", () => {
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

  it("F-20: rejects a null element in add_content_units with 400 instead of throwing a raw TypeError", async () => {
    vi.stubGlobal("fetch", fetchImpl(() => new Response(JSON.stringify({}), { status: 200 })));

    const response = await POST(
      postRequest({ pulp_href: REPO_HREF, add_content_units: [null] }),
      paramsFor("rpm")
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("F-20: rejects a non-array add_content_units with 400 instead of throwing a raw TypeError", async () => {
    vi.stubGlobal("fetch", fetchImpl(() => new Response(JSON.stringify({}), { status: 200 })));

    const response = await POST(
      postRequest({ pulp_href: REPO_HREF, add_content_units: 42 }),
      paramsFor("rpm")
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("F-20: rejects a null element in remove_content_units with 400 instead of throwing a raw TypeError", async () => {
    vi.stubGlobal("fetch", fetchImpl(() => new Response(JSON.stringify({}), { status: 200 })));

    const response = await POST(
      postRequest({ pulp_href: REPO_HREF, remove_content_units: [null] }),
      paramsFor("rpm")
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("F-20: rejects a non-array remove_content_units with 400 instead of throwing a raw TypeError", async () => {
    vi.stubGlobal("fetch", fetchImpl(() => new Response(JSON.stringify({}), { status: 200 })));

    const response = await POST(
      postRequest({ pulp_href: REPO_HREF, remove_content_units: "oops" }),
      paramsFor("rpm")
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("accepts a valid request, trimming and filtering out empty strings exactly as before", async () => {
    const fetchMock = fetchImpl(
      () => new Response(JSON.stringify({ task: "/pulp/api/v3/tasks/abc/" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      postRequest({
        pulp_href: REPO_HREF,
        add_content_units: [" /pulp/api/v3/content/rpm/packages/1/ ", "", "   "],
        remove_content_units: ["*", " /pulp/api/v3/content/rpm/packages/2/ "],
      }),
      paramsFor("rpm")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.task).toBe("/pulp/api/v3/tasks/abc/");

    const modifyCall = fetchMock.mock.calls.find(([input]) =>
      String(input instanceof Request ? input.url : input).includes("/modify/")
    );
    if (!modifyCall) throw new Error("no call to the modify endpoint");
    const init = modifyCall[1] as RequestInit;
    const sentBody = JSON.parse(String(init.body));
    expect(sentBody.add_content_units).toEqual(["/pulp/api/v3/content/rpm/packages/1/"]);
    expect(sentBody.remove_content_units).toEqual(["*", "/pulp/api/v3/content/rpm/packages/2/"]);
  });
});
