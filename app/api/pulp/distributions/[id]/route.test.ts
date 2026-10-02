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

import { DELETE, GET, PATCH } from "@/app/api/pulp/distributions/[id]/route";

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/pulp/distributions/[id]", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const distributionId = encodeURIComponent("/pulp/api/v3/distributions/rpm/rpm/abc/");

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    deleteCookieMock.mockClear();
    fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            pulp_href: "/pulp/api/v3/distributions/rpm/rpm/abc/",
            pulp_created: "2024-01-01T00:00:00Z",
            base_path: "my-repo",
            base_url: "http://lenovo-ideapad-gaming-3:8080/pulp/content/my-repo/",
            content_guard: null,
            pulp_labels: {},
            name: "my-repo",
            repository: null,
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("leaves base_url identical to Pulp's when PULP_CONTENT_ORIGIN is unset", async () => {
    const request = new Request(`http://pulp.test/api/pulp/distributions/${distributionId}`);

    const response = await GET(request, paramsFor(distributionId));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.base_url).toBe("http://lenovo-ideapad-gaming-3:8080/pulp/content/my-repo/");
  });

  it("replaces the origin while preserving the content path when PULP_CONTENT_ORIGIN is set", async () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "https://pulp.example.com");
    const request = new Request(`http://pulp.test/api/pulp/distributions/${distributionId}`);

    const response = await GET(request, paramsFor(distributionId));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.base_url).toBe("https://pulp.example.com/pulp/content/my-repo/");
  });
});

describe("decodeURIComponent guard for /api/pulp/distributions/[id] (F-17)", () => {
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

  it("returns a 400 with a detail instead of throwing for GET when id is '%'", async () => {
    const request = new Request("http://pulp.test/api/pulp/distributions/%");

    const response = await GET(request, paramsFor("%"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("returns a 400 with a detail instead of throwing for PATCH when id is '%'", async () => {
    const request = new Request("http://pulp.test/api/pulp/distributions/%", {
      method: "PATCH",
      body: JSON.stringify({ name: "new-name" }),
    });

    const response = await PATCH(request, paramsFor("%"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("returns a 400 with a detail instead of throwing for DELETE when id is '%'", async () => {
    const request = new Request("http://pulp.test/api/pulp/distributions/%", {
      method: "DELETE",
    });

    const response = await DELETE(request, paramsFor("%"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });
});

describe("PATCH /api/pulp/distributions/[id] null body (F-18)", () => {
  const distributionId = encodeURIComponent("/pulp/api/v3/distributions/rpm/rpm/abc/");

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    deleteCookieMock.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }))
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects a literal null body with 400 instead of throwing a raw TypeError", async () => {
    const request = new Request(`http://pulp.test/api/pulp/distributions/${distributionId}`, {
      method: "PATCH",
      body: "null",
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request, paramsFor(distributionId));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "Invalid request body." });
  });
});
