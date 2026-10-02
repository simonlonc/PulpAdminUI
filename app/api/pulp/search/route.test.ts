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

import { GET } from "@/app/api/pulp/search/route";

describe("GET /api/pulp/search response-shape guard (F-16)", () => {
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

  // search/route.ts fans a single query out to /repositories/, /remotes/, /distributions/ and
  // /contentguards/ with Promise.allSettled, so one bad family must not abort the others -- it
  // must come back as that family's own { count: 0, results: [], error } instead of a 502.

  it("falls back to a per-family error instead of throwing when a family's 200 body is a bare number", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("42", { status: 200 })));

    const response = await GET(new Request("http://pulp.test/api/pulp/search?search=x"));

    expect(response.status).toBe(200);
    const body = await response.json();
    for (const group of body.groups) {
      expect(group.count).toBe(0);
      expect(group.results).toEqual([]);
      expect(typeof group.error).toBe("string");
      expect(group.error.length).toBeGreaterThan(0);
    }
  });

  it("falls back to a per-family error instead of throwing when a family's 200 body has no results array", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));

    const response = await GET(new Request("http://pulp.test/api/pulp/search?search=x"));

    expect(response.status).toBe(200);
    const body = await response.json();
    for (const group of body.groups) {
      expect(group.count).toBe(0);
      expect(group.results).toEqual([]);
      expect(typeof group.error).toBe("string");
      expect(group.error.length).toBeGreaterThan(0);
    }
  });
});
