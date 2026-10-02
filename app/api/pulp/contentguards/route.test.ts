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

import { POST } from "@/app/api/pulp/contentguards/route";

describe("POST /api/pulp/contentguards", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("F-18: rejects a literal null body with 400 instead of throwing a raw TypeError", async () => {
    const request = new Request("http://pulp.test/api/pulp/contentguards", {
      method: "POST",
      body: "null",
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, undefined);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "Invalid request body." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("F-18: rejects a bare number body with 400 instead of throwing a raw TypeError", async () => {
    const request = new Request("http://pulp.test/api/pulp/contentguards", {
      method: "POST",
      body: "42",
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, undefined);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "Invalid request body." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("F-19: rejects a null element in guards with 400 instead of throwing a raw TypeError", async () => {
    const request = new Request("http://pulp.test/api/pulp/contentguards", {
      method: "POST",
      body: JSON.stringify({ kind: "core.composite", name: "x", guards: [null] }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, undefined);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("F-19: rejects a non-array guards with 400 instead of throwing a raw TypeError", async () => {
    const request = new Request("http://pulp.test/api/pulp/contentguards", {
      method: "POST",
      body: JSON.stringify({ kind: "core.composite", name: "x", guards: 42 }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, undefined);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("F-19: accepts a valid guards array of strings unchanged", async () => {
    fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ pulp_href: "/pulp/api/v3/contentguards/core/composite/x/" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("http://pulp.test/api/pulp/contentguards", {
      method: "POST",
      body: JSON.stringify({
        kind: "core.composite",
        name: "x",
        guards: ["/pulp/api/v3/contentguards/core/header/abc/"],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, undefined);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const sentBody = JSON.parse(String(init.body));
    expect(sentBody.guards).toEqual(["/pulp/api/v3/contentguards/core/header/abc/"]);
  });
});
