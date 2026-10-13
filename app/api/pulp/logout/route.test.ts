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
  }),
}));

import { POST } from "@/app/api/pulp/logout/route";

describe("logout route", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    deleteCookieMock.mockClear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("ends the Pulp session with DELETE /login/ and clears the cookie", async () => {
    cookieState.value = encodePulpAuth({
      username: "admin",
      password: "pw",
      pulpSession: { sessionid: "sess", csrftoken: "csrf" },
    });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const response = await POST();

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://pulp.test/pulp/api/v3/login/");
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe("DELETE");
    expect(init.headers.get("Cookie")).toBe("sessionid=sess; csrftoken=csrf");
    expect(init.headers.get("X-CSRFToken")).toBe("csrf");
    expect(init.headers.get("Referer")).toBe("http://pulp.test/");
    expect(deleteCookieMock).toHaveBeenCalledWith("pulp_auth");
  });

  it("still clears the cookie when DELETE /login/ fails", async () => {
    cookieState.value = encodePulpAuth({
      username: "admin",
      password: "pw",
      pulpSession: { sessionid: "sess", csrftoken: "csrf" },
    });
    fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));

    const response = await POST();

    expect(response.status).toBe(200);
    expect(deleteCookieMock).toHaveBeenCalledWith("pulp_auth");
  });

  it("makes no Pulp call for a cookie without a session", async () => {
    cookieState.value = encodePulpAuth({ username: "admin", password: "pw" });

    await POST();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(deleteCookieMock).toHaveBeenCalledWith("pulp_auth");
  });
});
