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

import { POST } from "@/app/api/pulp/repositories/reclaim/route";

describe("POST /api/pulp/repositories/reclaim", () => {
  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }))
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("F-15: rejects a literal null body with 400 instead of throwing a raw TypeError", async () => {
    const request = new Request("http://pulp.test/api/pulp/repositories/reclaim", {
      method: "POST",
      body: "null",
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, undefined);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "Invalid request body." });
  });

  it("rejects a null element in repo_hrefs with 400 instead of throwing a raw TypeError", async () => {
    const request = new Request("http://pulp.test/api/pulp/repositories/reclaim", {
      method: "POST",
      body: JSON.stringify({ repo_hrefs: [null] }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, undefined);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("rejects a non-array repo_hrefs with 400 instead of throwing a raw TypeError", async () => {
    const request = new Request("http://pulp.test/api/pulp/repositories/reclaim", {
      method: "POST",
      body: JSON.stringify({ repo_hrefs: 42 }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, undefined);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("rejects a non-array repo_versions_keeplist with 400 instead of silently dropping it", async () => {
    const request = new Request("http://pulp.test/api/pulp/repositories/reclaim", {
      method: "POST",
      body: JSON.stringify({
        repo_hrefs: ["/pulp/api/v3/repositories/rpm/rpm/abc/"],
        repo_versions_keeplist: "oops",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, undefined);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("rejects a null element in repo_versions_keeplist with 400 instead of throwing a raw TypeError", async () => {
    const request = new Request("http://pulp.test/api/pulp/repositories/reclaim", {
      method: "POST",
      body: JSON.stringify({
        repo_hrefs: ["/pulp/api/v3/repositories/rpm/rpm/abc/"],
        repo_versions_keeplist: [null],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, undefined);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("accepts a valid repo_hrefs array, preserving the \"*\" special case", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ task: "/pulp/api/v3/tasks/abc/" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("http://pulp.test/api/pulp/repositories/reclaim", {
      method: "POST",
      body: JSON.stringify({
        repo_hrefs: ["*"],
        repo_versions_keeplist: ["/pulp/api/v3/repositories/rpm/rpm/versions/1/"],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, undefined);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const sentBody = JSON.parse(String(init.body));
    expect(sentBody.repo_hrefs).toEqual(["*"]);
    expect(sentBody.repo_versions_keeplist).toHaveLength(1);
  });
});
