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

import { GET } from "@/app/api/pulp/distributions/route";

describe("GET /api/pulp/distributions", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    deleteCookieMock.mockClear();
    fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            count: 1,
            next: null,
            previous: null,
            results: [
              {
                pulp_href: "/pulp/api/v3/distributions/rpm/rpm/abc/",
                pulp_created: "2024-01-01T00:00:00Z",
                base_path: "my-repo",
                base_url: "http://lenovo-ideapad-gaming-3:8080/pulp/content/my-repo/",
                content_guard: null,
                pulp_labels: {},
                name: "my-repo",
                repository: null,
              },
            ],
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
    const response = await GET(new Request("http://pulp.test/api/pulp/distributions"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results[0].base_url).toBe(
      "http://lenovo-ideapad-gaming-3:8080/pulp/content/my-repo/"
    );
    expect(body.count).toBe(1);
  });

  it("replaces the origin while preserving the content path when PULP_CONTENT_ORIGIN is set", async () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "https://pulp.example.com");

    const response = await GET(new Request("http://pulp.test/api/pulp/distributions"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results[0].base_url).toBe("https://pulp.example.com/pulp/content/my-repo/");
  });
});
