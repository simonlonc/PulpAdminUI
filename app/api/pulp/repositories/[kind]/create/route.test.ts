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

import { POST } from "@/app/api/pulp/repositories/[kind]/create/route";

// The plugin registry falls back to the curated PULP_PLUGINS when /docs/api.json fails.
describe("POST /api/pulp/repositories/[kind]/create retain_checkpoints", () => {
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

  function create(extra: Record<string, unknown>) {
    return POST(
      new Request("http://pulp.test/api/pulp/repositories/file/create", {
        method: "POST",
        body: JSON.stringify({ name: "repo", ...extra }),
      }),
      { params: Promise.resolve({ kind: "file" }) }
    );
  }

  function sentBody(): Record<string, unknown> {
    const call = fetchMock.mock.calls.findLast(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    if (!call) throw new Error("no POST reached Pulp");
    return JSON.parse(String((call[1] as RequestInit).body));
  }

  it("sends the value, and null when blank or absent", async () => {
    await create({ retain_checkpoints: 2 });
    expect(sentBody().retain_checkpoints).toBe(2);
    await create({ retain_checkpoints: null });
    expect(sentBody().retain_checkpoints).toBeNull();
    await create({});
    expect(sentBody().retain_checkpoints).toBeNull();
  });

  it("rejects an invalid value with a 400 instead of dropping it", async () => {
    for (const bad of [0, 1.5, "abc"]) {
      fetchMock.mockClear();
      const response = await create({ retain_checkpoints: bad });

      expect(response.status).toBe(400);
      expect((await response.json()).detail).toMatch(/Retain checkpoints must be a whole number of at least 1/);
      expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(
        false
      );
    }
  });

  it("sends a null description when it is blank or absent, since Pulp rejects an empty string", async () => {
    for (const extra of [{}, { description: "" }, { description: "   " }, { description: null }]) {
      await create(extra);
      expect(sentBody().description).toBeNull();
    }
    await create({ description: "mirror" });
    expect(sentBody().description).toBe("mirror");
  });

  it("rejects a retain_repo_versions that is a fraction, too large or below 1, and keeps blank as null", async () => {
    for (const bad of [1.5, 1e56, 0, -2, "abc"]) {
      fetchMock.mockClear();
      const response = await create({ retain_repo_versions: bad });

      expect(response.status).toBe(400);
      expect((await response.json()).detail).toMatch(/Retain repo versions must be a whole number of at least 1/);
      expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(
        false
      );
    }
    await create({ retain_repo_versions: null });
    expect(sentBody().retain_repo_versions).toBeNull();
    await create({ retain_repo_versions: 3 });
    expect(sentBody().retain_repo_versions).toBe(3);
  });
});
