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

import { DELETE } from "@/app/api/pulp/publications/[id]/route";

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("decodeURIComponent guard for /api/pulp/publications/[id] (F-17)", () => {
  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    deleteCookieMock.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 }))
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns a 400 with a detail instead of throwing for DELETE when id is '%'", async () => {
    const request = new Request("http://pulp.test/api/pulp/publications/%", {
      method: "DELETE",
    });

    const response = await DELETE(request, paramsFor("%"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });
});
