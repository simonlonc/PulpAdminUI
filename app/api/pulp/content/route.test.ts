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

import { GET } from "@/app/api/pulp/content/route";

function calledUrl(fetchMock: ReturnType<typeof vi.fn>): URL {
  const input = fetchMock.mock.calls[0][0];
  return new URL(String(input instanceof Request ? input.url : input));
}

describe("GET /api/pulp/content", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), {
          status: 200,
        })
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("forwards pulp_type and all three repository version scopes and drops an unlisted param", async () => {
    const v = (n: number) => encodeURIComponent(`/pulp/api/v3/repositories/rpm/rpm/abc/versions/${n}/`);
    await GET(
      new Request(
        `http://pulp.test/api/pulp/content?pulp_type=rpm.package&repository_version=${v(3)}&repository_version_added=${v(2)}&repository_version_removed=${v(1)}&arbitrary=1`
      )
    );

    const url = calledUrl(fetchMock);
    expect(url.searchParams.get("pulp_type")).toBe("rpm.package");
    expect(url.searchParams.get("repository_version")).toBe(
      "/pulp/api/v3/repositories/rpm/rpm/abc/versions/3/"
    );
    expect(url.searchParams.get("repository_version_added")).toBe(
      "/pulp/api/v3/repositories/rpm/rpm/abc/versions/2/"
    );
    expect(url.searchParams.get("repository_version_removed")).toBe(
      "/pulp/api/v3/repositories/rpm/rpm/abc/versions/1/"
    );
    expect(url.searchParams.has("arbitrary")).toBe(false);
  });
});
