import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodePulpAuth } from "@/lib/pulp";

const { cookieState } = vi.hoisted(() => ({
  cookieState: { value: undefined as string | undefined },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieState.value === undefined ? undefined : { name, value: cookieState.value },
    delete: () => {
      cookieState.value = undefined;
    },
    set: () => {},
  }),
}));

import { PATCH } from "@/app/api/pulp/roles/[id]/route";

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

const VALID_ROLE_ID = "12345678-1234-1234-1234-123456789abc";

describe("PATCH /api/pulp/roles/[id]", () => {
  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }))
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("F-15: rejects a JSON body that is a bare number with 400 instead of throwing a raw TypeError", async () => {
    const request = new Request(`http://pulp.test/api/pulp/roles/${VALID_ROLE_ID}`, {
      method: "PATCH",
      body: "42",
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request, paramsFor(VALID_ROLE_ID));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "Invalid request body." });
  });
});
