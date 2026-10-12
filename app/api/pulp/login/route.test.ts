import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodePulpAuth } from "@/lib/pulp";

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

import { GET, POST } from "@/app/api/pulp/login/route";

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

  it("F-18: rejects a literal null body with 400 instead of throwing a raw TypeError", async () => {
    const request = new Request("http://pulp.test/api/pulp/login", {
      method: "POST",
      body: "null",
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "Invalid request body." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("F-18: rejects a bare number body with 400 instead of throwing a raw TypeError", async () => {
    const request = new Request("http://pulp.test/api/pulp/login", {
      method: "POST",
      body: "42",
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "Invalid request body." });
    expect(fetchMock).not.toHaveBeenCalled();
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

  describe("GET /api/pulp/login", () => {
    it("responds 200 with username when given a valid cookie and never calls fetch", async () => {
      const encodedAuth = encodePulpAuth({ username: "admin", password: "adminpass" });
      cookieState["pulp_auth"] = {
        value: encodedAuth,
        options: {},
      };

      const response = await GET();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ username: "admin" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("responds 401 with 'Not authenticated.' when no cookie is present", async () => {
      const response = await GET();

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ detail: "Not authenticated." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("responds 401 with 'Invalid session.' when cookie is corrupted and deletes the cookie", async () => {
      cookieState["pulp_auth"] = {
        value: "not-a-valid-encoded-session",
        options: {},
      };

      const response = await GET();

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ detail: "Invalid session." });
      expect(cookieState["pulp_auth"]).toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("cookie secure flag", () => {
    async function loginAndGetCookieOptions() {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ count: 1 }), { status: 200 })
      );
      const request = new Request("http://pulp.test/api/pulp/login", {
        method: "POST",
        body: JSON.stringify({ username: "admin", password: "adminpass" }),
      });
      const response = await POST(request);
      expect(response.status).toBe(200);
      return setCookieMock.mock.calls[0][2] as Record<string, unknown>;
    }

    it("is secure in production by default", async () => {
      vi.stubEnv("NODE_ENV", "production");

      expect((await loginAndGetCookieOptions()).secure).toBe(true);
    });

    it.each(["false", "FALSE", "0"])(
      "is not secure in production when PULP_COOKIE_SECURE=%s",
      async (value) => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("PULP_COOKIE_SECURE", value);

        expect((await loginAndGetCookieOptions()).secure).toBe(false);
      }
    );

    it("is not secure outside production", async () => {
      vi.stubEnv("NODE_ENV", "development");

      expect((await loginAndGetCookieOptions()).secure).toBe(false);
    });
  });
});
