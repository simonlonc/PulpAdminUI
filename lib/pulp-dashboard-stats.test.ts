import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cacheCalls } = vi.hoisted(() => ({
  cacheCalls: [] as { keyParts: unknown[]; callArgs: unknown[][] }[],
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown, keyParts: unknown[]) => {
    const record = { keyParts, callArgs: [] as unknown[][] };
    cacheCalls.push(record);
    return (...args: unknown[]) => {
      record.callArgs.push(args);
      return fn(...args);
    };
  },
}));

import { getCachedPulpDashboardStats } from "@/lib/pulp-dashboard-stats";

describe("getCachedPulpDashboardStats", () => {
  const password = "super-secret-password";

  beforeEach(() => {
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cacheCalls.length = 0;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keys the cache on the username only, never the password", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ count: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await getCachedPulpDashboardStats({ username: "admin", password });

    expect(cacheCalls).toHaveLength(1);
    expect(cacheCalls[0].keyParts).toEqual(["pulp-dashboard-stats", "admin"]);
    for (const keyPart of cacheCalls[0].keyParts) {
      expect(String(keyPart)).not.toContain(password);
    }
    for (const args of cacheCalls[0].callArgs) {
      for (const arg of args) {
        expect(JSON.stringify(arg ?? null)).not.toContain(password);
      }
    }
  });

  it("produces different key parts for different usernames", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ count: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await getCachedPulpDashboardStats({ username: "admin", password });
    await getCachedPulpDashboardStats({ username: "other", password });

    expect(cacheCalls).toHaveLength(2);
    expect(cacheCalls[0].keyParts).toEqual(["pulp-dashboard-stats", "admin"]);
    expect(cacheCalls[1].keyParts).toEqual(["pulp-dashboard-stats", "other"]);
  });

  it("resolves counts from the five upstream calls, with auth reaching pulpFetch through the closure", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      let count = 0;
      if (url.includes("/users/")) count = 3;
      else if (url.includes("/groups/")) count = 2;
      else if (url.includes("/repositories/rpm/rpm/")) count = 5;
      else if (url.includes("/repositories/deb/apt/")) count = 4;
      else if (url.includes("/repositories/file/file/")) count = 1;
      return new Response(JSON.stringify({ count, next: null, previous: null, results: [] }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCachedPulpDashboardStats({ username: "admin", password });

    expect(result).toEqual({
      ok: true,
      usersCount: 3,
      groupsCount: 2,
      rpmRepositories: 5,
      debRepositories: 4,
      fileRepositories: 1,
      repositoriesTotal: 10,
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const [firstUrl, firstInit] = fetchMock.mock.calls[0];
    expect(String(firstUrl)).toBe("http://pulp.test/pulp/api/v3/users/?limit=1&offset=0");
    expect((firstInit as RequestInit).headers).toBeInstanceOf(Headers);
    expect(((firstInit as RequestInit).headers as Headers).get("Authorization")).toBe(
      `Basic ${Buffer.from(`admin:${password}`, "utf8").toString("base64")}`
    );
  });
});
