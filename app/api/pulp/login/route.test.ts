import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodePulpAuth, encodePulpAuth } from "@/lib/pulp";

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
import { GET as getStatus } from "@/app/api/pulp/status/route";

// A Pulp without `/login/`: the first call is the 404, then Basic auth carries the users lookup.
function mockLoginNotFound(fetchMock: ReturnType<typeof vi.fn>) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ detail: "Not found." }), { status: 404 })
  );
}

function sessionLoginResponse(): Response {
  const headers = new Headers();
  headers.append("Set-Cookie", "csrftoken=csrf123; Max-Age=31449600; Path=/; SameSite=Lax");
  headers.append("Set-Cookie", "sessionid=sess456; HttpOnly; Max-Age=1209600; Path=/; SameSite=Lax");
  return new Response(JSON.stringify({ username: "admin" }), { status: 201, headers });
}

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
    mockLoginNotFound(fetchMock);
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://pulp.test/pulp/api/v3/login/");
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "http://pulp.test/pulp/api/v3/users/?username=admin"
    );
  });

  it("login succeeds with 200 and sets session cookie when lookup returns 403", async () => {
    mockLoginNotFound(fetchMock);
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
    mockLoginNotFound(fetchMock);
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
    mockLoginNotFound(fetchMock);
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
    mockLoginNotFound(fetchMock);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 1 }), { status: 200 })
    );
    const request = new Request("http://pulp.test/api/pulp/login", {
      method: "POST",
      body: JSON.stringify({ username: "a b/c", password: "pass" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "http://pulp.test/pulp/api/v3/users/?username=a%20b%2Fc"
    );
  });

  it("stores the Pulp session from POST /login/ and checks the user with it", async () => {
    fetchMock.mockResolvedValueOnce(sessionLoginResponse());
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ count: 1 }), { status: 200 }));
    const request = new Request("http://pulp.test/api/pulp/login", {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "adminpass" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const [loginUrl, loginInit] = fetchMock.mock.calls[0];
    expect(String(loginUrl)).toBe("http://pulp.test/pulp/api/v3/login/");
    expect(loginInit.method).toBe("POST");
    expect((loginInit.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    const lookupHeaders = fetchMock.mock.calls[1][1].headers as Headers;
    expect(lookupHeaders.get("Cookie")).toBe("sessionid=sess456; csrftoken=csrf123");
    expect(lookupHeaders.has("Authorization")).toBe(false);
    expect(decodePulpAuth(setCookieMock.mock.calls[0][1])).toEqual({
      username: "admin",
      password: "adminpass",
      pulpSession: { sessionid: "sess456", csrftoken: "csrf123" },
    });
  });

  it("falls back to Basic and stores no session when POST /login/ answers 404", async () => {
    mockLoginNotFound(fetchMock);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ count: 1 }), { status: 200 }));
    const request = new Request("http://pulp.test/api/pulp/login", {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "adminpass" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect((fetchMock.mock.calls[1][1].headers as Headers).get("Authorization")).toMatch(/^Basic /);
    expect(decodePulpAuth(setCookieMock.mock.calls[0][1])).toEqual({
      username: "admin",
      password: "adminpass",
    });
  });

  it("responds with Pulp's status and sets no cookie when POST /login/ answers 401", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Invalid username/password." }), { status: 401 })
    );
    const request = new Request("http://pulp.test/api/pulp/login", {
      method: "POST",
      body: JSON.stringify({ username: "admin", password: "wrong" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ detail: "Invalid username/password." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(setCookieMock).not.toHaveBeenCalled();
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

  describe("with several Pulp servers", () => {
    let directory: string;
    let file: string;

    function backend(id: string, label: string) {
      return {
        id,
        label,
        baseUrl: `http://${id}.test/pulp/api/v3`,
        createdAt: "2026-01-01T00:00:00.000Z",
      };
    }

    function postLogin(body: Record<string, unknown>) {
      return POST(
        new Request("http://app.test/api/pulp/login", {
          method: "POST",
          body: JSON.stringify({ username: "admin", password: "adminpass", ...body }),
        })
      );
    }

    // A Pulp with sessions: the login, then the users lookup.
    function queueSuccessfulLogin() {
      fetchMock.mockResolvedValueOnce(sessionLoginResponse());
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ count: 1 }), { status: 200 }));
    }

    const requestedUrls = () => fetchMock.mock.calls.map(([url]) => String(url));

    beforeEach(async () => {
      // The failures below are logged at error level; keep those lines out of the test output.
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      directory = await mkdtemp(join(tmpdir(), "pulp-login-test-"));
      file = join(directory, "pulp-backends.json");
      await writeFile(file, JSON.stringify([backend("a", "Alpha"), backend("b", "Bravo")]));
      vi.stubEnv("PULP_BACKENDS_FILE", file);
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await rm(directory, { recursive: true, force: true });
    });

    it("logs in against the backend named by backendId and keeps its id, not its URL, in the cookie", async () => {
      queueSuccessfulLogin();

      const response = await postLogin({ backendId: "b" });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ username: "admin" });
      expect(requestedUrls()).toEqual([
        "http://b.test/pulp/api/v3/login/",
        "http://b.test/pulp/api/v3/users/?username=admin",
      ]);
      const stored = decodePulpAuth(setCookieMock.mock.calls[0][1]);
      expect(stored).toEqual({
        username: "admin",
        password: "adminpass",
        pulpSession: { sessionid: "sess456", csrftoken: "csrf123" },
        backendId: "b",
      });
      expect(stored).not.toHaveProperty("baseUrl");
    });

    it("sends each session's later requests to the server it logged in to", async () => {
      const cookieValues: string[] = [];
      for (const backendId of ["a", "b"]) {
        queueSuccessfulLogin();
        expect((await postLogin({ backendId })).status).toBe(200);
        cookieValues.push(cookieState["pulp_auth"].value);
      }
      fetchMock.mockClear();
      fetchMock.mockImplementation(async () => new Response(JSON.stringify({}), { status: 200 }));

      for (const value of cookieValues) {
        cookieState["pulp_auth"] = { value, options: {} };
        const response = await getStatus(new Request("http://app.test/api/pulp/status"), undefined);
        expect(response.status).toBe(200);
      }

      expect(requestedUrls()).toEqual([
        "http://a.test/pulp/api/v3/status/",
        "http://b.test/pulp/api/v3/status/",
      ]);
    });

    it("never takes the server from the request body", async () => {
      queueSuccessfulLogin();

      await postLogin({ backendId: "a", baseUrl: "http://evil.test/pulp/api/v3" });

      expect(requestedUrls()).toEqual([
        "http://a.test/pulp/api/v3/login/",
        "http://a.test/pulp/api/v3/users/?username=admin",
      ]);
    });

    it("uses the only server in the list when backendId is absent", async () => {
      await writeFile(file, JSON.stringify([backend("a", "Alpha")]));
      queueSuccessfulLogin();

      const response = await postLogin({});

      expect(response.status).toBe(200);
      expect(requestedUrls()[0]).toBe("http://a.test/pulp/api/v3/login/");
      expect(decodePulpAuth(setCookieMock.mock.calls[0][1])?.backendId).toBe("a");
    });

    it("does not write the default backend's id into the cookie", async () => {
      await writeFile(file, JSON.stringify([backend("default", "Alpha"), backend("b", "Bravo")]));
      queueSuccessfulLogin();

      const response = await postLogin({ backendId: "default" });

      expect(response.status).toBe(200);
      expect(requestedUrls()[0]).toBe("http://default.test/pulp/api/v3/login/");
      expect(decodePulpAuth(setCookieMock.mock.calls[0][1])).not.toHaveProperty("backendId");
    });

    it("responds 400 and calls no server when several are listed and backendId is absent", async () => {
      const response = await postLogin({});

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Choose a Pulp server." });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(setCookieMock).not.toHaveBeenCalled();
    });

    it("responds 400 and calls no server for an unknown backendId", async () => {
      const response = await postLogin({ backendId: "nope" });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Unknown Pulp server." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([5, "", null, ["a"]])("responds 400 for a backendId that is not a non-empty string (%j)", async (backendId) => {
      const response = await postLogin({ backendId });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Invalid request body." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("responds 500 when no server is configured at all", async () => {
      vi.stubEnv("PULP_BACKENDS_FILE", join(directory, "missing.json"));
      vi.stubEnv("PULP_BASE_URL", undefined);

      const response = await postLogin({});

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ detail: "No Pulp server is configured." });
    });

    it("responds 500 without naming the file when the server list is corrupt", async () => {
      await writeFile(file, "{ not json");

      const response = await postLogin({ backendId: "a" });

      expect(response.status).toBe(500);
      const { detail } = await response.json();
      expect(detail).toBe("The Pulp server list cannot be read.");
      expect(detail).not.toContain(directory);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("names the server by its label, never its URL, when it cannot be reached", async () => {
      fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

      const response = await postLogin({ backendId: "a" });

      expect(response.status).toBe(502);
      const { detail } = await response.json();
      expect(detail).toBe("Could not reach Pulp server at Alpha: connect ECONNREFUSED");
      expect(detail).not.toContain("a.test");
    });

    it("keeps the URL out of a failure detail from either Pulp call", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Cannot reach http://b.test/pulp/api/v3 or http://b.test/pulp/api/v3" }), {
          status: 500,
        })
      );
      const fromLogin = await postLogin({ backendId: "b" });
      expect(await fromLogin.json()).toEqual({ detail: "Cannot reach Bravo or Bravo" });

      mockLoginNotFound(fetchMock);
      fetchMock.mockRejectedValueOnce(new Error("failed http://b.test/pulp/api/v3/users/"));
      const fromLookup = await postLogin({ backendId: "b" });
      expect(fromLookup.status).toBe(502);
      expect(await fromLookup.json()).toEqual({
        detail: "Could not reach Pulp server at Bravo: failed Bravo/users/",
      });
    });

    describe("GET /api/pulp/login", () => {
      it("responds 200 with username for a session on a listed server and never calls fetch", async () => {
        cookieState["pulp_auth"] = {
          value: encodePulpAuth({ username: "admin", password: "adminpass", backendId: "b" }),
          options: {},
        };

        const response = await GET();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ username: "admin" });
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it("responds 401 and deletes the cookie when the session's server is no longer listed", async () => {
        cookieState["pulp_auth"] = {
          value: encodePulpAuth({ username: "admin", password: "adminpass", backendId: "gone" }),
          options: {},
        };

        const response = await GET();

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ detail: "Invalid session." });
        expect(cookieState["pulp_auth"]).toBeUndefined();
        expect(fetchMock).not.toHaveBeenCalled();
      });
    });
  });

  describe("cookie secure flag", () => {
    async function loginAndGetCookieOptions() {
      mockLoginNotFound(fetchMock);
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
