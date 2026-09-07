import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cacheCalls, pluginsState } = vi.hoisted(() => ({
  cacheCalls: [] as { keyParts: unknown[]; callArgs: unknown[][] }[],
  pluginsState: {
    plugins: [
      { kind: "rpm", label: "RPM", repositoryPath: "/repositories/rpm/rpm/" },
      { kind: "deb", label: "Debian", repositoryPath: "/repositories/deb/apt/" },
    ] as { kind: string; label: string; repositoryPath: string }[],
  },
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

// The registry itself is exercised by lib/pulp-plugin-derive.test.ts and
// lib/pulp-plugin-overlay.test.ts. Here it's mocked to a small fixed set of families so this
// file's tests stay about the dashboard stats logic, not registry derivation.
vi.mock("@/lib/pulp-plugin-registry", () => ({
  getPulpPluginRegistry: vi.fn(async () => pluginsState.plugins),
}));

import { getCachedPulpDashboardStats } from "@/lib/pulp-dashboard-stats";

describe("getCachedPulpDashboardStats", () => {
  const password = "super-secret-password";

  beforeEach(() => {
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cacheCalls.length = 0;
    pluginsState.plugins = [
      { kind: "rpm", label: "RPM", repositoryPath: "/repositories/rpm/rpm/" },
      { kind: "deb", label: "Debian", repositoryPath: "/repositories/deb/apt/" },
    ];
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

  it("resolves per-kind repository counts from the registry, with auth reaching pulpFetch through the closure", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/status/")) {
        return new Response(
          JSON.stringify({
            online_workers: [{ name: "w1" }, { name: "w2" }],
            online_api_apps: [{ name: "a1" }],
            online_content_apps: [{ name: "c1" }],
          }),
          { status: 200 }
        );
      }
      let count = 0;
      if (url.includes("/users/")) count = 3;
      else if (url.includes("/groups/")) count = 2;
      else if (url.includes("/repositories/rpm/rpm/")) count = 5;
      else if (url.includes("/repositories/deb/apt/")) count = 4;
      else if (url.includes("/tasks/") && url.includes("state__in")) count = 1;
      else if (url.includes("/tasks/") && url.includes("state=failed")) count = 2;
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
      repositories: [
        { kind: "rpm", label: "RPM", count: 5 },
        { kind: "deb", label: "Debian", count: 4 },
      ],
      repositoriesTotal: 9,
      activity: {
        runningTasks: 1,
        failedTasks: 2,
        onlineWorkers: 2,
        onlineContentApps: 1,
        onlineApiApps: 1,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(7);
    const [firstUrl, firstInit] = fetchMock.mock.calls[0];
    expect(String(firstUrl)).toBe("http://pulp.test/pulp/api/v3/users/?limit=1&offset=0");
    expect((firstInit as RequestInit).headers).toBeInstanceOf(Headers);
    expect(((firstInit as RequestInit).headers as Headers).get("Authorization")).toBe(
      `Basic ${Buffer.from(`admin:${password}`, "utf8").toString("base64")}`
    );
  });

  it("degrades per signal: a 403 on one upstream call still yields ok:true with the rest intact", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/groups/")) {
        return new Response(JSON.stringify({ detail: "Forbidden." }), { status: 403 });
      }
      if (url.includes("/status/")) {
        return new Response(
          JSON.stringify({
            online_workers: [{ name: "w1" }],
            online_api_apps: [{ name: "a1" }],
            online_content_apps: [{ name: "c1" }, { name: "c2" }],
          }),
          { status: 200 }
        );
      }
      let count = 0;
      if (url.includes("/users/")) count = 3;
      else if (url.includes("/repositories/rpm/rpm/")) count = 5;
      else if (url.includes("/repositories/deb/apt/")) count = 4;
      else if (url.includes("/tasks/") && url.includes("state=failed")) count = 2;
      return new Response(JSON.stringify({ count, next: null, previous: null, results: [] }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCachedPulpDashboardStats({ username: "admin", password });

    expect(result).toEqual({
      ok: true,
      usersCount: 3,
      groupsCount: null,
      repositories: [
        { kind: "rpm", label: "RPM", count: 5 },
        { kind: "deb", label: "Debian", count: 4 },
      ],
      repositoriesTotal: 9,
      activity: {
        runningTasks: 0,
        failedTasks: 2,
        onlineWorkers: 1,
        onlineContentApps: 2,
        onlineApiApps: 1,
      },
    });
  });

  it("resolves activity signals from the tasks and status endpoints", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/status/")) {
        return new Response(
          JSON.stringify({
            online_workers: [{ name: "w1" }, { name: "w2" }],
            online_api_apps: [{ name: "a1" }, { name: "a2" }],
            online_content_apps: [{ name: "c1" }, { name: "c2" }],
          }),
          { status: 200 }
        );
      }
      let count = 0;
      if (url.includes("state__in")) count = 3;
      else if (url.includes("state=failed")) count = 1;
      return new Response(JSON.stringify({ count, next: null, previous: null, results: [] }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCachedPulpDashboardStats({ username: "admin", password });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.activity).toEqual({
        runningTasks: 3,
        failedTasks: 1,
        onlineWorkers: 2,
        onlineContentApps: 2,
        onlineApiApps: 2,
      });
    }
  });

  it("requests running+waiting tasks with repeated state__in params, never a comma-joined list", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await getCachedPulpDashboardStats({ username: "admin", password });

    const runningTasksCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/tasks/") && String(input).includes("state__in")
    );
    expect(runningTasksCall).toBeDefined();
    expect(String(runningTasksCall![0])).toBe(
      "http://pulp.test/pulp/api/v3/tasks/?state__in=running&state__in=waiting&limit=1"
    );
  });

  it("returns ok:false only when every signal fails to load", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ detail: "Forbidden." }), { status: 403 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCachedPulpDashboardStats({ username: "admin", password });

    expect(result).toEqual({ ok: false, detail: "Forbidden.", status: 403 });
  });
});
