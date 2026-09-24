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

import { POST } from "@/app/api/pulp/uploads/route";

describe("uploads route", () => {
  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("F-14: rejects a JSON body with 400 instead of throwing a raw error out of request.formData()", async () => {
    const request = new Request("http://pulp.test/api/pulp/uploads", {
      method: "POST",
      body: JSON.stringify({ file: "not a real upload" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "Invalid multipart form data." });
  });
});
