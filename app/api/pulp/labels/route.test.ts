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

import { DELETE, POST } from "@/app/api/pulp/labels/route";

describe("labels route", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    deleteCookieMock.mockClear();
    fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("POST passes an allowed prefix through to the upstream set_label endpoint", async () => {
    const request = new Request("http://pulp.test/api/pulp/labels", {
      method: "POST",
      body: JSON.stringify({ pulp_href: "/repositories/rpm/rpm/abc/", key: "env", value: "prod" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "http://pulp.test/pulp/api/v3/repositories/rpm/rpm/abc/set_label/"
    );
  });

  it("DELETE passes an allowed prefix through to the upstream unset_label endpoint", async () => {
    const request = new Request("http://pulp.test/api/pulp/labels", {
      method: "DELETE",
      body: JSON.stringify({ pulp_href: "/content/rpm/packages/abc/", key: "env" }),
    });

    const response = await DELETE(request);

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "http://pulp.test/pulp/api/v3/content/rpm/packages/abc/unset_label/"
    );
  });

  it("POST rejects a disallowed prefix with 400 and never calls fetch", async () => {
    const request = new Request("http://pulp.test/api/pulp/labels", {
      method: "POST",
      body: JSON.stringify({ pulp_href: "/users/1/", key: "env", value: "prod" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "Not a labelable resource href." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DELETE rejects a disallowed prefix with 400 and never calls fetch", async () => {
    const request = new Request("http://pulp.test/api/pulp/labels", {
      method: "DELETE",
      body: JSON.stringify({ pulp_href: "/users/1/", key: "env" }),
    });

    const response = await DELETE(request);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a field-keyed Pulp 400 body as a readable detail", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ key: ["This field is required."] }), { status: 400 })
    );
    const request = new Request("http://pulp.test/api/pulp/labels", {
      method: "POST",
      body: JSON.stringify({ pulp_href: "/repositories/rpm/rpm/abc/", key: "env", value: "prod" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "key: This field is required." });
  });

  it("deletes the auth cookie when the upstream call returns 403", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Forbidden." }), { status: 403 }));
    const request = new Request("http://pulp.test/api/pulp/labels", {
      method: "POST",
      body: JSON.stringify({ pulp_href: "/repositories/rpm/rpm/abc/", key: "env", value: "prod" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(deleteCookieMock).toHaveBeenCalledWith("pulp_auth");
  });

  // Known open bug: normalizePulpHrefToApiPath (app/api/pulp/repositories/_server.ts) only runs
  // new URL() on absolute http(s) hrefs, so a relative href's "../" segments survive the
  // allowlist check untouched here, while the eventual fetch() call resolves the concatenated
  // URL string per the URL spec and lands on a completely different path. Fixed by L4, which
  // will normalize parent-directory segments in normalizePulpHrefToApiPath. When L4 lands,
  // change `it.fails` below to `it`.
  it.fails("rejects a traversal href that would escape the allowlisted prefix", async () => {
    const request = new Request("http://pulp.test/api/pulp/labels", {
      method: "POST",
      body: JSON.stringify({
        pulp_href: "/repositories/../../../../pulp/api/v3/status/",
        key: "env",
        value: "prod",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
