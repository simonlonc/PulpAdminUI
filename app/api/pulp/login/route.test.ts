import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cookieState, setCookieMock } = vi.hoisted(() => ({
  cookieState: {} as Record<string, { value: string; options: Record<string, unknown> }>,
  setCookieMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => cookieState[name],
    delete: (name: string) => {
      delete cookieState[name];
    },
    set: (name: string, value: string, options: Record<string, unknown>) => {
      setCookieMock(name, value, options);
      cookieState[name] = { value, options };
    },
  }),
}));

import { POST } from "@/app/api/pulp/login/route";

describe("login route", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    delete cookieState["pulp_auth"];
    setCookieMock.mockClear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("responds 200 with username when lookup returns count: 1, calls fetch exactly once with percent-encoded username in URL", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 1 }), { status: 200 })
    );
    const request = new Request("http://pulp.test/api/pulp/login", {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "adminpass" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ username: "admin" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "http://pulp.test/pulp/api/v3/users/?username=admin"
    );
  });

  it("login succeeds with 200 and sets session cookie when lookup returns 403", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Forbidden." }), { status: 403 })
    );
    const request = new Request("http://pulp.test/api/pulp/login", {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "adminpass" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ username: "admin" });
    expect(setCookieMock).toHaveBeenCalledTimes(1);
  });

  it("responds 401 when lookup returns 401 and does not set session cookie", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Unauthorized." }), { status: 401 })
    );
    const request = new Request("http://pulp.test/api/pulp/login", {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "adminpass" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(setCookieMock).not.toHaveBeenCalled();
  });

  it("responds 403 with detail when lookup returns count: 0", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 0 }), { status: 200 })
    );
    const request = new Request("http://pulp.test/api/pulp/login", {
      method: "POST",
      body: JSON.stringify({ username: "nosuchuser", password: "pass" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      detail: "Authenticated but user cannot be found in Pulp users list.",
    });
  });

  it("percent-encodes special characters in username", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 1 }), { status: 200 })
    );
    const request = new Request("http://pulp.test/api/pulp/login", {
      method: "POST",
      body: JSON.stringify({ username: "a b/c", password: "pass" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "http://pulp.test/pulp/api/v3/users/?username=a%20b%2Fc"
    );
  });
});
