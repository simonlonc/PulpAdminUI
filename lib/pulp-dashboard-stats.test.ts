import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pluginsState } = vi.hoisted(() => ({
  pluginsState: {
    plugins: [
      { kind: "rpm", label: "RPM", repositoryPath: "/repositories/rpm/rpm/" },
      { kind: "deb", label: "Debian", repositoryPath: "/repositories/deb/apt/" },
    ] as { kind: string; label: string; repositoryPath: string }[],
  },
}));

// The registry itself is exercised by lib/pulp-plugin-derive.test.ts and
// lib/pulp-plugin-overlay.test.ts. Here it's mocked to a small fixed set of families so this
// file's tests stay about the dashboard stats logic, not registry derivation.
vi.mock("@/lib/pulp-plugin-registry", () => ({
  getPulpPluginRegistry: vi.fn(async () => pluginsState.plugins),
}));

type GetStats = typeof import("@/lib/pulp-dashboard-stats").getCachedPulpDashboardStats;
let getCachedPulpDashboardStats: GetStats;

const RPM_HREF = (id: number) => `/pulp/api/v3/repositories/rpm/rpm/${id}/`;
const DEB_HREF = (id: number) => `/pulp/api/v3/repositories/deb/apt/${id}/`;

function repositoriesPage(hrefs: string[], next: string | null = null) {
  return new Response(
    JSON.stringify({
      count: hrefs.length,
      next,
      previous: null,
      results: hrefs.map((pulp_href) => ({ pulp_href }))
    }),
    { status: 200 }
  );
}

describe("getCachedPulpDashboardStats", () => {
  const password = "super-secret-password";

  beforeEach(async () => {
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    // The module keeps its cache in memory; start every test from an empty one.
    vi.resetModules();
    ({ getCachedPulpDashboardStats } = await import("@/lib/pulp-dashboard-stats"));
    pluginsState.plugins = [
      { kind: "rpm", label: "RPM", repositoryPath: "/repositories/rpm/rpm/" },
      { kind: "deb", label: "Debian", repositoryPath: "/repositories/deb/apt/" },
    ];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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
      if (url.includes("/repositories/")) {
        return repositoriesPage([1, 2, 3, 4, 5].map(RPM_HREF).concat([1, 2, 3, 4].map(DEB_HREF)));
      }
      let count = 0;
      if (url.includes("/users/")) count = 3;
      else if (url.includes("/groups/")) count = 2;
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
    expect(fetchMock).toHaveBeenCalledTimes(6);
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
      if (url.includes("/repositories/")) {
        return repositoriesPage([1, 2, 3, 4, 5].map(RPM_HREF).concat([1, 2, 3, 4].map(DEB_HREF)));
      }
      let count = 0;
      if (url.includes("/users/")) count = 3;
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

  describe("repository counts", () => {
    function statsFetch(repositories: (url: string) => Response) {
      return vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/repositories/")) return repositories(url);
        return new Response(JSON.stringify({ count: 1, next: null, previous: null, results: [] }), {
          status: 200
        });
      });
    }

    it("groups one walk over two pages of next by kind, a kind with none reports 0", async () => {
      pluginsState.plugins.push({
        kind: "file",
        label: "File",
        repositoryPath: "/repositories/file/file/"
      });
      const fetchMock = statsFetch((url) =>
        url.includes("offset=1000")
          ? repositoriesPage([RPM_HREF(3), DEB_HREF(1), "/pulp/api/v3/repositories/other/x/1/"])
          : repositoriesPage(
              [RPM_HREF(1), RPM_HREF(2)],
              "http://pulp.test/pulp/api/v3/repositories/?fields=pulp_href&limit=1000&offset=1000"
            )
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await getCachedPulpDashboardStats({ username: "admin", password });

      expect(result.ok && result.repositories).toEqual([
        { kind: "rpm", label: "RPM", count: 3 },
        { kind: "deb", label: "Debian", count: 1 },
        { kind: "file", label: "File", count: 0 }
      ]);
      expect(result.ok && result.repositoriesTotal).toBe(4);
      const walked = fetchMock.mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.includes("/repositories/"));
      expect(walked).toEqual([
        "http://pulp.test/pulp/api/v3/repositories/?fields=pulp_href&limit=1000",
        "http://pulp.test/pulp/api/v3/repositories/?fields=pulp_href&limit=1000&offset=1000"
      ]);
    });

    it("reports null for every kind when the walk fails, keeping the other signals", async () => {
      const fetchMock = statsFetch(
        () => new Response(JSON.stringify({ detail: "boom" }), { status: 500 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await getCachedPulpDashboardStats({ username: "admin", password });

      expect(result.ok && result.repositories).toEqual([
        { kind: "rpm", label: "RPM", count: null },
        { kind: "deb", label: "Debian", count: null }
      ]);
      expect(result.ok && result.usersCount).toBe(1);
    });

    it("reports null when a later page fails", async () => {
      const fetchMock = statsFetch((url) =>
        url.includes("offset=1000")
          ? new Response("{}", { status: 500 })
          : repositoriesPage(
              [RPM_HREF(1)],
              "http://pulp.test/pulp/api/v3/repositories/?fields=pulp_href&limit=1000&offset=1000"
            )
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await getCachedPulpDashboardStats({ username: "admin", password });

      expect(result.ok && result.repositories.map((repo) => repo.count)).toEqual([null, null]);
    });
  });

  describe("in-memory cache", () => {
    function countingFetch() {
      let round = 0;
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/users/")) round += 1;
        return new Response(
          JSON.stringify({ count: round, next: null, previous: null, results: [] }),
          { status: 200 }
        );
      });
      return fetchMock;
    }
    const usersFetches = (fetchMock: ReturnType<typeof countingFetch>) =>
      fetchMock.mock.calls.filter(([input]) => String(input).includes("/users/")).length;

    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("serves a result under 60s old without refetching", async () => {
      const fetchMock = countingFetch();
      vi.stubGlobal("fetch", fetchMock);

      const first = await getCachedPulpDashboardStats({ username: "admin", password });
      vi.advanceTimersByTime(59_000);
      const second = await getCachedPulpDashboardStats({ username: "admin", password });

      expect(second).toEqual(first);
      expect(usersFetches(fetchMock)).toBe(1);
    });

    it("returns the old value at once after 60s and refreshes once in the background", async () => {
      const fetchMock = countingFetch();
      vi.stubGlobal("fetch", fetchMock);
      const first = await getCachedPulpDashboardStats({ username: "admin", password });
      vi.advanceTimersByTime(61_000);

      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation(async (input) => {
        await gate;
        return original(input);
      });

      const stale = await getCachedPulpDashboardStats({ username: "admin", password });
      expect(stale).toEqual(first);
      expect(usersFetches(fetchMock)).toBe(2);

      release();
      await vi.waitFor(async () => {
        const fresh = await getCachedPulpDashboardStats({ username: "admin", password });
        expect(fresh.ok && fresh.usersCount).toBe(2);
      });
      expect(usersFetches(fetchMock)).toBe(2);
    });

    it("makes one refresh for two concurrent stale calls", async () => {
      const fetchMock = countingFetch();
      vi.stubGlobal("fetch", fetchMock);
      await getCachedPulpDashboardStats({ username: "admin", password });
      vi.advanceTimersByTime(61_000);

      await Promise.all([
        getCachedPulpDashboardStats({ username: "admin", password }),
        getCachedPulpDashboardStats({ username: "admin", password })
      ]);
      await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(6));

      expect(usersFetches(fetchMock)).toBe(2);
    });

    it("keeps the last good result when a refresh fails, and caches per username", async () => {
      const fetchMock = countingFetch();
      vi.stubGlobal("fetch", fetchMock);
      const first = await getCachedPulpDashboardStats({ username: "admin", password });
      await getCachedPulpDashboardStats({ username: "other", password });
      expect(usersFetches(fetchMock)).toBe(2);

      vi.advanceTimersByTime(61_000);
      fetchMock.mockImplementation(
        async () => new Response(JSON.stringify({ detail: "down" }), { status: 503 })
      );
      await getCachedPulpDashboardStats({ username: "admin", password });
      await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(14));

      expect(await getCachedPulpDashboardStats({ username: "admin", password })).toEqual(first);
    });
  });
});
