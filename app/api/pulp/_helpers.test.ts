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
