import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodePulpAuth } from "@/lib/pulp";

const { cookieState } = vi.hoisted(() => ({
  cookieState: { value: undefined as string | undefined },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieState.value === undefined ? undefined : { name, value: cookieState.value },
    delete: () => {},
    set: () => {},
  }),
}));

import { PATCH, POST } from "@/app/api/pulp/remotes/[kind]/route";

// The plugin registry falls back to the curated PULP_PLUGINS when /docs/api.json fails.
describe("remote numeric fields", () => {
  const href = "/pulp/api/v3/remotes/file/file/abc/";
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/docs/api.json")
        ? new Response("", { status: 500 })
        : new Response(JSON.stringify({ task: "/pulp/api/v3/tasks/t/" }), { status: 202 })
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function post(extra: Record<string, unknown>) {
    return POST(
      new Request("http://pulp.test/api/pulp/remotes/file", {
        method: "POST",
        body: JSON.stringify({ name: "r", url: "http://example.test/", ...extra }),
      }),
      { params: Promise.resolve({ kind: "file" }) }
    );
  }

  function patch(extra: Record<string, unknown>) {
    return PATCH(
      new Request("http://pulp.test/api/pulp/remotes/file", {
        method: "PATCH",
        body: JSON.stringify({ pulp_href: href, ...extra }),
      }),
      { params: Promise.resolve({ kind: "file" }) }
    );
  }

  function sentBody(method: string): Record<string, unknown> {
    const call = fetchMock.mock.calls.findLast(([, init]) => (init as RequestInit | undefined)?.method === method);
    if (!call) throw new Error(`no ${method} reached Pulp`);
    return JSON.parse(String((call[1] as RequestInit).body));
  }

  function reachedPulp(method: string): boolean {
    return fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === method);
  }

  const badConcurrency: [string, unknown][] = [
    ["a fraction", 1.5],
    ["a fractional string", "1.5"],
    ["an overflow", 1e56],
    ["below the minimum", 0],
    ["not a number", "abc"],
  ];

  for (const [label, value] of badConcurrency) {
    it(`rejects download_concurrency ${label} on create and edit`, async () => {
      const created = await post({ download_concurrency: value });
      expect(created.status).toBe(400);
      expect((await created.json()).detail).toBe("Download concurrency must be a whole number of at least 1.");
      expect(reachedPulp("POST")).toBe(false);

      const edited = await patch({ download_concurrency: value });
      expect(edited.status).toBe(400);
      expect((await edited.json()).detail).toBe("Download concurrency must be a whole number of at least 1.");
      expect(reachedPulp("PATCH")).toBe(false);
    });
  }

  it("keeps a blank or absent download_concurrency as null and a whole number as is", async () => {
    await post({});
    expect(sentBody("POST").download_concurrency).toBeNull();
    await post({ download_concurrency: "" });
    expect(sentBody("POST").download_concurrency).toBeNull();
    await post({ download_concurrency: 4 });
    expect(sentBody("POST").download_concurrency).toBe(4);
    await patch({ download_concurrency: null });
    expect(sentBody("PATCH").download_concurrency).toBeNull();
  });

  it("rejects a fractional or overflowing whole-number or non-numeric tuning field", async () => {
    for (const [name, value, message] of [
      ["rate_limit", 1.5, "Rate limit must be a whole number."],
      ["max_retries", 1e56, "Max retries must be a whole number."],
      ["total_timeout", "abc", "Total timeout must be a number."],
    ] as const) {
      const response = await post({ [name]: value });
      expect(response.status).toBe(400);
      expect((await response.json()).detail).toBe(message);
    }
    expect(reachedPulp("POST")).toBe(false);
  });

  it("keeps blank tuning numbers as null and fractional timeouts as is", async () => {
    await post({ rate_limit: "", total_timeout: 1.5, max_retries: 3 });
    expect(sentBody("POST")).toMatchObject({
      rate_limit: null,
      total_timeout: 1.5,
      max_retries: 3,
      connect_timeout: null,
    });
    await patch({ rate_limit: null });
    expect(sentBody("PATCH")).toEqual({ rate_limit: null });
  });
});
