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

import { DELETE, GET, POST } from "@/app/api/pulp/object-roles/route";

describe("object-roles route", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    deleteCookieMock.mockClear();
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ roles: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("GET passes an allowed prefix through to the upstream list_roles endpoint", async () => {
    const request = new Request(
      "http://pulp.test/api/pulp/object-roles?pulp_href=/repositories/rpm/rpm/abc/"
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "http://pulp.test/pulp/api/v3/repositories/rpm/rpm/abc/list_roles/"
    );
  });

  it("POST passes an allowed prefix through to the upstream add_role endpoint", async () => {
    const request = new Request("http://pulp.test/api/pulp/object-roles", {
      method: "POST",
      body: JSON.stringify({ pulp_href: "/contentguards/abc/", role: "core.viewer", users: ["u"] }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "http://pulp.test/pulp/api/v3/contentguards/abc/add_role/"
    );
  });

  it("DELETE passes an allowed prefix through to the upstream remove_role endpoint", async () => {
    const request = new Request("http://pulp.test/api/pulp/object-roles", {
      method: "DELETE",
      body: JSON.stringify({ pulp_href: "/distributions/abc/", role: "core.viewer", groups: ["g"] }),
    });

    const response = await DELETE(request);

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "http://pulp.test/pulp/api/v3/distributions/abc/remove_role/"
    );
  });

  it("GET rejects a disallowed prefix with 400 and never calls fetch", async () => {
    const request = new Request("http://pulp.test/api/pulp/object-roles?pulp_href=/users/1/");

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "Not a role-assignable resource href." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POST rejects a disallowed prefix with 400 and never calls fetch", async () => {
    const request = new Request("http://pulp.test/api/pulp/object-roles", {
      method: "POST",
      body: JSON.stringify({ pulp_href: "/users/1/", role: "core.viewer" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes the auth cookie when the upstream call returns 401", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Not authenticated." }), { status: 401 })
    );
    const request = new Request(
      "http://pulp.test/api/pulp/object-roles?pulp_href=/repositories/rpm/rpm/abc/"
    );

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(deleteCookieMock).toHaveBeenCalledWith("pulp_auth");
  });

  // normalizePulpHrefToApiPath (app/api/pulp/repositories/_server.ts) resolves parent-directory
  // segments before the allowlist check runs, so a traversal href is rejected here with 400 and
  // never reaches fetch.
  it("rejects a traversal href that would escape the allowlisted prefix", async () => {
    const request = new Request(
      "http://pulp.test/api/pulp/object-roles?" +
        new URLSearchParams({ pulp_href: "/repositories/../../../../pulp/api/v3/status/" }).toString()
    );

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
