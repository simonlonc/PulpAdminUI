import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PULP_PLUGINS } from "@/lib/pulp-plugins";

// Deriving the real 6.4MB spec is covered by lib/pulp-plugin-derive.test.ts. Here the derivation
// is replaced by one family named after the spec's tag, so a test can tell which build a
// registry came from.
vi.mock("@/lib/pulp-plugin-derive", () => ({
  derivePulpPlugins: (spec: unknown) => {
    const tag = (spec as { tag?: string } | undefined)?.tag;
    return tag ? [{ kind: `built-${tag}`, contentEndpoints: [] }] : [];
  },
}));

type GetRegistry = typeof import("@/lib/pulp-plugin-registry").getPulpPluginRegistry;
let getPulpPluginRegistry: GetRegistry;

const auth = { username: "admin", password: "super-secret-password" };
const TTL_MS = 10 * 60 * 1000;
const RETRY_MS = 60 * 1000;

function specResponse(tag: string) {
  return new Response(JSON.stringify({ tag }), { status: 200 });
}

function kindsOf(registry: readonly { kind: string }[]) {
  return registry.map((plugin) => plugin.kind);
}

describe("getPulpPluginRegistry", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    vi.stubEnv("PULP_PLUGIN_DIR", "");
    // The module keeps its cache in memory; start every test from an empty one.
    vi.resetModules();
    ({ getPulpPluginRegistry } = await import("@/lib/pulp-plugin-registry"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("builds the registry from the spec on the first call and serves it from memory after", async () => {
    const fetchMock = vi.fn(async () => specResponse("one"));
    vi.stubGlobal("fetch", fetchMock);

    expect(kindsOf(await getPulpPluginRegistry(auth))).toEqual(["built-one"]);
    expect(kindsOf(await getPulpPluginRegistry(auth))).toEqual(["built-one"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the old registry at once after expiry and refreshes once in the background", async () => {
    const fetchMock = vi.fn(async () => specResponse("old"));
    vi.stubGlobal("fetch", fetchMock);
    await getPulpPluginRegistry(auth);

    let release: (response: Response) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => (release = resolve))
    );
    vi.advanceTimersByTime(TTL_MS);

    // Resolves while the refresh is still pending: the fetch never finished.
    expect(kindsOf(await getPulpPluginRegistry(auth))).toEqual(["built-old"]);
    expect(kindsOf(await getPulpPluginRegistry(auth))).toEqual(["built-old"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    release(specResponse("new"));
    await vi.advanceTimersByTimeAsync(0);

    expect(kindsOf(await getPulpPluginRegistry(auth))).toEqual(["built-new"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the last good registry when the refresh fails, and retries only after the retry window", async () => {
    const fetchMock = vi.fn(async () => specResponse("old"));
    vi.stubGlobal("fetch", fetchMock);
    await getPulpPluginRegistry(auth);

    fetchMock.mockImplementation(async () => new Response("down", { status: 503 }));
    vi.advanceTimersByTime(TTL_MS);
    expect(kindsOf(await getPulpPluginRegistry(auth))).toEqual(["built-old"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Inside the retry window: the old registry again, with no new fetch.
    vi.advanceTimersByTime(RETRY_MS - 1);
    expect(kindsOf(await getPulpPluginRegistry(auth))).toEqual(["built-old"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // After it, one more attempt, which now succeeds.
    fetchMock.mockImplementation(async () => specResponse("new"));
    vi.advanceTimersByTime(1);
    expect(kindsOf(await getPulpPluginRegistry(auth))).toEqual(["built-old"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(kindsOf(await getPulpPluginRegistry(auth))).toEqual(["built-new"]);
  });

  it("keeps the last good registry when the refresh throws", async () => {
    const fetchMock = vi.fn(async () => specResponse("old"));
    vi.stubGlobal("fetch", fetchMock);
    await getPulpPluginRegistry(auth);

    fetchMock.mockImplementation(async () => {
      throw new Error("connection refused");
    });
    vi.advanceTimersByTime(TTL_MS);
    expect(kindsOf(await getPulpPluginRegistry(auth))).toEqual(["built-old"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(kindsOf(await getPulpPluginRegistry(auth))).toEqual(["built-old"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("makes one fetch for two calls during an outage with no good registry", async () => {
    const fetchMock = vi.fn(async () => new Response("down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([getPulpPluginRegistry(auth), getPulpPluginRegistry(auth)]);
    expect(first).toEqual(PULP_PLUGINS);
    expect(second).toEqual(PULP_PLUGINS);
    expect(await getPulpPluginRegistry(auth)).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches after the fallback's 60s window and replaces it with the real registry", async () => {
    const fetchMock = vi.fn(async () => new Response("down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getPulpPluginRegistry(auth)).toEqual(PULP_PLUGINS);

    vi.advanceTimersByTime(RETRY_MS - 1);
    expect(await getPulpPluginRegistry(auth)).toEqual(PULP_PLUGINS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockImplementation(async () => specResponse("back"));
    vi.advanceTimersByTime(1);
    expect(kindsOf(await getPulpPluginRegistry(auth))).toEqual(["built-back"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The real registry is now the one served, with no further fetch.
    expect(kindsOf(await getPulpPluginRegistry(auth))).toEqual(["built-back"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  describe("with several Pulp servers", () => {
    const one = { ...auth, baseUrl: "http://one.test/pulp/api/v3" };
    const two = { ...auth, baseUrl: "http://two.test/pulp/api/v3" };

    it("keeps one registry per base URL and never serves one server's for another", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
        specResponse(String(input).startsWith(one.baseUrl) ? "one" : "two")
      );
      vi.stubGlobal("fetch", fetchMock);

      expect(kindsOf(await getPulpPluginRegistry(one))).toEqual(["built-one"]);
      expect(kindsOf(await getPulpPluginRegistry(two))).toEqual(["built-two"]);
      expect(kindsOf(await getPulpPluginRegistry(one))).toEqual(["built-one"]);
      expect(kindsOf(await getPulpPluginRegistry(two))).toEqual(["built-two"]);
      expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
        "http://one.test/pulp/api/v3/docs/api.json",
        "http://two.test/pulp/api/v3/docs/api.json",
      ]);
    });

    it("keeps one server's outage fallback away from another", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
        String(input).startsWith(one.baseUrl)
          ? new Response("down", { status: 503 })
          : specResponse("two")
      );
      vi.stubGlobal("fetch", fetchMock);

      expect(await getPulpPluginRegistry(one)).toEqual(PULP_PLUGINS);
      expect(kindsOf(await getPulpPluginRegistry(two))).toEqual(["built-two"]);
    });
  });
});
