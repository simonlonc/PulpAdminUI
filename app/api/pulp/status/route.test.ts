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

import { GET } from "@/app/api/pulp/status/route";

describe("GET /api/pulp/status", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    deleteCookieMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("passes content_settings through untouched and reports content_origin_effective null when PULP_CONTENT_ORIGIN is unset", async () => {
    fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content_settings: {
              content_origin: "http://lenovo-ideapad-gaming-3:8080",
              content_path_prefix: "/pulp/content/",
            },
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://pulp.test/api/pulp/status"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.content_settings).toEqual({
      content_origin: "http://lenovo-ideapad-gaming-3:8080",
      content_path_prefix: "/pulp/content/",
    });
    expect(body.content_origin_effective).toBeNull();
  });

  it("keeps Pulp's own content_origin and reports the override as content_origin_effective when PULP_CONTENT_ORIGIN is set", async () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "https://pulp.example.com");
    fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content_settings: {
              content_origin: "http://lenovo-ideapad-gaming-3:8080",
              content_path_prefix: "/pulp/content/",
            },
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://pulp.test/api/pulp/status"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.content_settings.content_origin).toBe("http://lenovo-ideapad-gaming-3:8080");
    // applyContentOrigin rewrites via new URL(...).pathname, which is "/" for a bare origin.
    expect(body.content_origin_effective).toBe("https://pulp.example.com/");
  });

  it("falls back to the override as content_origin_effective when Pulp reports content_settings: null", async () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "https://pulp.example.com");
    fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ content_settings: null }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://pulp.test/api/pulp/status"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.content_settings).toBeNull();
    expect(body.content_origin_effective).toBe("https://pulp.example.com");
  });

  it("behaves exactly like unset for a malformed PULP_CONTENT_ORIGIN: no throw, no 500", async () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "not a url");
    fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content_settings: {
              content_origin: "http://lenovo-ideapad-gaming-3:8080",
              content_path_prefix: "/pulp/content/",
            },
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://pulp.test/api/pulp/status"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.content_settings.content_origin).toBe("http://lenovo-ideapad-gaming-3:8080");
    expect(body.content_origin_effective).toBeNull();
  });
});
