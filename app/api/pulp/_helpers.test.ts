import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import { decodePulpAuth, encodePulpAuth, pulpFetch } from "@/lib/pulp";

const { cookieState, setCookieMock, deleteCookieMock } = vi.hoisted(() => ({
  cookieState: { value: undefined as string | undefined },
  setCookieMock: vi.fn(),
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
    set: (name: string, value: string, options: Record<string, unknown>) => {
      setCookieMock(name, value, options);
    },
  }),
}));

describe("withPulpAuth session renewal", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  function loginResponse(): Response {
    const headers = new Headers();
    headers.append("Set-Cookie", "csrftoken=csrf-new; Path=/");
    headers.append("Set-Cookie", "sessionid=sess-new; HttpOnly; Path=/");
    return new Response("{}", { status: 201, headers });
  }

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    vi.stubEnv("LOG_LEVEL", "silent");
    cookieState.value = encodePulpAuth({
      username: "admin",
      password: "pw",
      pulpSession: { sessionid: "sess-old", csrftoken: "csrf-old" },
    });
    setCookieMock.mockClear();
    deleteCookieMock.mockClear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function queueRenewal() {
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(loginResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 0 }), { status: 200 }));
  }

  it("rewrites the auth cookie with the new session after a renewal", async () => {
    queueRenewal();
    const handler = withPulpAuth(async (_request, auth) => {
      await pulpFetch("/repositories/", auth);
      return Response.json({ ok: true });
    });

    const response = await handler(new Request("http://app.test/api/pulp/x"), undefined);

    expect(response.status).toBe(200);
    expect(setCookieMock).toHaveBeenCalledTimes(1);
    const [name, value, options] = setCookieMock.mock.calls[0];
    expect(name).toBe("pulp_auth");
    expect(options).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/", maxAge: 28800 });
    expect(decodePulpAuth(value)?.pulpSession).toEqual({
      sessionid: "sess-new",
      csrftoken: "csrf-new",
    });
  });

  it("rewrites the cookie when the handler then throws a non-401 PulpApiError", async () => {
    queueRenewal();
    const handler = withPulpAuth(async (_request, auth) => {
      await pulpFetch("/repositories/", auth);
      throw new PulpApiError(404, "Gone.");
    });

    const response = await handler(new Request("http://app.test/api/pulp/x"), undefined);

    expect(response.status).toBe(404);
    expect(setCookieMock).toHaveBeenCalledTimes(1);
  });

  it("does not rewrite the cookie on a 401 that deletes it", async () => {
    queueRenewal();
    const handler = withPulpAuth(async (_request, auth) => {
      await pulpFetch("/repositories/", auth);
      throw new PulpApiError(401, "Nope.");
    });

    const response = await handler(new Request("http://app.test/api/pulp/x"), undefined);

    expect(response.status).toBe(401);
    expect(setCookieMock).not.toHaveBeenCalled();
    expect(deleteCookieMock).toHaveBeenCalledWith("pulp_auth");
  });

  it("does not touch the cookie when no renewal happened", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ count: 0 }), { status: 200 }));
    const handler = withPulpAuth(async (_request, auth) => {
      await pulpFetch("/repositories/", auth);
      return Response.json({ ok: true });
    });

    await handler(new Request("http://app.test/api/pulp/x"), undefined);

    expect(setCookieMock).not.toHaveBeenCalled();
  });
});

describe("withPulpAuth backend resolution", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let directory: string;
  let file: string;

  function backend(id: string) {
    return {
      id,
      label: `Server ${id}`,
      baseUrl: `http://${id}.test/pulp/api/v3`,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
  }

  const handler = withPulpAuth(async (_request, auth) => {
    await pulpFetch("/repositories/", auth);
    return Response.json({ ok: true });
  });

  const call = () => handler(new Request("http://app.test/api/pulp/x"), undefined);

  beforeEach(async () => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://env.test/pulp/api/v3");
    // A corrupt server list is logged at error level; keep that line out of the test output.
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    directory = await mkdtemp(join(tmpdir(), "pulp-helpers-test-"));
    file = join(directory, "pulp-backends.json");
    await writeFile(file, JSON.stringify([backend("default"), backend("b")]));
    vi.stubEnv("PULP_BACKENDS_FILE", file);
    setCookieMock.mockClear();
    deleteCookieMock.mockClear();
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ count: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  });

  it("sends the handler's Pulp calls to the server the session's backendId names", async () => {
    cookieState.value = encodePulpAuth({ username: "admin", password: "pw", backendId: "b" });

    const response = await call();

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://b.test/pulp/api/v3/repositories/");
  });

  it("resolves a session without a backendId to the default backend of the list", async () => {
    cookieState.value = encodePulpAuth({ username: "admin", password: "pw" });

    await call();

    expect(String(fetchMock.mock.calls[0][0])).toBe("http://default.test/pulp/api/v3/repositories/");
  });

  it("responds 401 and deletes the cookie when the session's backend is no longer listed", async () => {
    cookieState.value = encodePulpAuth({ username: "admin", password: "pw", backendId: "gone" });

    const response = await call();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ detail: "Invalid session." });
    expect(deleteCookieMock).toHaveBeenCalledWith("pulp_auth");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("responds 500 without naming the file when the server list is corrupt, and keeps the cookie", async () => {
    await writeFile(file, "{ not json");
    cookieState.value = encodePulpAuth({ username: "admin", password: "pw", backendId: "b" });

    const response = await call();

    expect(response.status).toBe(500);
    const { detail } = await response.json();
    expect(detail).toBe("The Pulp server list cannot be read.");
    expect(detail).not.toContain(directory);
    expect(deleteCookieMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the backendId, and never the base URL, when a renewal rewrites the cookie", async () => {
    cookieState.value = encodePulpAuth({
      username: "admin",
      password: "pw",
      pulpSession: { sessionid: "sess-old", csrftoken: "csrf-old" },
      backendId: "b",
    });
    const headers = new Headers();
    headers.append("Set-Cookie", "csrftoken=csrf-new; Path=/");
    headers.append("Set-Cookie", "sessionid=sess-new; HttpOnly; Path=/");
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 201, headers }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 0 }), { status: 200 }));

    await call();

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://b.test/pulp/api/v3/repositories/",
      "http://b.test/pulp/api/v3/login/",
      "http://b.test/pulp/api/v3/repositories/",
    ]);
    const stored = decodePulpAuth(setCookieMock.mock.calls[0][1]);
    expect(stored).toEqual({
      username: "admin",
      password: "pw",
      pulpSession: { sessionid: "sess-new", csrftoken: "csrf-new" },
      backendId: "b",
    });
    expect(stored).not.toHaveProperty("baseUrl");
  });
});
