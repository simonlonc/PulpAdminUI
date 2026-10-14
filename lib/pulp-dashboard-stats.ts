import { getPulpBaseUrl, pulpFetch, type PulpAuth } from "@/lib/pulp";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { findPluginForRepositoryHrefIn } from "@/lib/pulp-plugins";
import type { PulpStatus } from "@/services/pulp/types";

type PulpCountListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: unknown[];
};

type PulpFetchResult<TData> = Awaited<ReturnType<typeof pulpFetch<TData>>>;
type PulpCountFetchResult = PulpFetchResult<PulpCountListResponse>;

export type PulpDashboardRepositoryCount = {
  kind: string;
  label: string;
  /** null when this family's count could not be loaded. */
  count: number | null;
};

export type PulpDashboardActivity = {
  /** null when the signal could not be loaded. */
  runningTasks: number | null;
  failedTasks: number | null;
  onlineWorkers: number | null;
  onlineContentApps: number | null;
  onlineApiApps: number | null;
};

export type PulpDashboardStatsResult =
  | {
      ok: true;
      /** null when this signal could not be loaded. */
      usersCount: number | null;
      groupsCount: number | null;
      repositories: PulpDashboardRepositoryCount[];
      repositoriesTotal: number;
      activity: PulpDashboardActivity;
    }
  | { ok: false; detail: string; status?: number };

function countFromSettled(result: PromiseSettledResult<PulpCountFetchResult>): number | null {
  return result.status === "fulfilled" && result.value.ok ? result.value.data.count : null;
}

type PulpRepositoryHrefPage = {
  next: string | null;
  results: { pulp_href?: string }[];
};

// Path of a `next` link relative to the Pulp API base, or null when there is none. lib/ does not
// import from app/, so this is not app/api/pulp/repositories/_server.ts's extractNextApiPath.
function nextPathFrom(next: unknown, auth: PulpAuth): string | null {
  if (!next || typeof next !== "string") return null;
  try {
    const url = new URL(next);
    const basePath = new URL(getPulpBaseUrl(auth)).pathname.replace(/\/+$/, "");
    const path = url.pathname.startsWith(basePath) ? url.pathname.slice(basePath.length) : url.pathname;
    return path + url.search;
  } catch {
    return null;
  }
}

/** Every repository href of every kind, following `next` to the end; null when a page fails. */
async function loadRepositoryHrefs(auth: PulpAuth): Promise<string[] | null> {
  const hrefs: string[] = [];
  let nextPath: string | null = "/repositories/?fields=pulp_href&limit=1000";
  while (nextPath) {
    const result: PulpFetchResult<PulpRepositoryHrefPage> = await pulpFetch<PulpRepositoryHrefPage>(
      nextPath,
      auth
    );
    if (!result.ok || !Array.isArray(result.data.results)) return null;
    for (const row of result.data.results) {
      if (typeof row.pulp_href === "string") hrefs.push(row.pulp_href);
    }
    nextPath = nextPathFrom(result.data.next, auth);
  }
  return hrefs;
}

function failureFromSettled<TData>(
  result: PromiseSettledResult<PulpFetchResult<TData>>
): { detail: string; status?: number } | null {
  if (result.status === "rejected") {
    return { detail: result.reason instanceof Error ? result.reason.message : String(result.reason) };
  }
  return result.value.ok ? null : { detail: result.value.detail, status: result.value.status };
}

async function loadPulpDashboardStats(auth: PulpAuth): Promise<PulpDashboardStatsResult> {
  const [
    pluginsResult,
    usersResult,
    groupsResult,
    runningTasksResult,
    failedTasksResult,
    statusResult,
    repoHrefsResult,
  ] = await Promise.allSettled([
    getPulpPluginRegistry(auth),
    pulpFetch<PulpCountListResponse>("/users/?limit=1&offset=0", auth),
    pulpFetch<PulpCountListResponse>("/groups/?limit=1&offset=0", auth),
    // state__in must be sent as repeated params -- a comma-joined value silently matches zero
    // tasks on this API.
    pulpFetch<PulpCountListResponse>("/tasks/?state__in=running&state__in=waiting&limit=1", auth),
    pulpFetch<PulpCountListResponse>("/tasks/?state=failed&limit=1", auth),
    pulpFetch<PulpStatus>("/status/", auth),
    loadRepositoryHrefs(auth),
  ]);

  const plugins = pluginsResult.status === "fulfilled" ? pluginsResult.value : [];
  const usersCount = countFromSettled(usersResult);
  const groupsCount = countFromSettled(groupsResult);
  const runningTasks = countFromSettled(runningTasksResult);
  const failedTasks = countFromSettled(failedTasksResult);
  const status =
    statusResult.status === "fulfilled" && statusResult.value.ok ? statusResult.value.data : null;
  const onlineWorkers = Array.isArray(status?.online_workers) ? status.online_workers.length : null;
  const onlineContentApps = Array.isArray(status?.online_content_apps)
    ? status.online_content_apps.length
    : null;
  const onlineApiApps = Array.isArray(status?.online_api_apps) ? status.online_api_apps.length : null;

  // One walk of the generic /repositories/ list, grouped by kind. Hrefs no registry entry claims
  // are ignored; a failed walk leaves every count null.
  const repoHrefs = repoHrefsResult.status === "fulfilled" ? repoHrefsResult.value : null;
  const repoCounts = new Map<string, number>();
  for (const href of repoHrefs ?? []) {
    const plugin = findPluginForRepositoryHrefIn(plugins, href);
    if (plugin) repoCounts.set(plugin.kind, (repoCounts.get(plugin.kind) ?? 0) + 1);
  }

  const repositories: PulpDashboardRepositoryCount[] = plugins.map((plugin) => ({
    kind: plugin.kind,
    label: plugin.label,
    count: repoHrefs ? (repoCounts.get(plugin.kind) ?? 0) : null,
  }));

  const hasSignal =
    usersCount !== null ||
    groupsCount !== null ||
    repositories.some((repo) => repo.count !== null) ||
    runningTasks !== null ||
    failedTasks !== null ||
    status !== null;

  if (!hasSignal) {
    const failure = failureFromSettled(usersResult) ??
      failureFromSettled(groupsResult) ??
      failureFromSettled(runningTasksResult) ??
      failureFromSettled(failedTasksResult) ??
      failureFromSettled(statusResult) ?? { detail: "Failed to load dashboard stats." };
    return { ok: false, detail: failure.detail, status: failure.status };
  }

  const repositoriesTotal = repositories.reduce(
    (sum, repo) => (repo.count !== null ? sum + repo.count : sum),
    0
  );

  return {
    ok: true,
    usersCount,
    groupsCount,
    repositories,
    repositoriesTotal,
    activity: {
      runningTasks,
      failedTasks,
      onlineWorkers,
      onlineContentApps,
      onlineApiApps,
    },
  };
}

// Dashboard stats (users, groups, repositories, activity) are kept in memory per Pulp server and
// username: the last good result is served at once, and once it is 60s old one background refresh
// replaces it.
// unstable_cache was dropped because it cannot do this here: it does serve the stale value, but
// the route's response is not ended until its background refresh finishes (Next 16.2.2
// build/templates/app-route.js passes renderOpts.pendingWaitUntil to sendResponse, and
// pipe-readable.js awaits it before res.end()), so a stale call still waited the full ~13s.
const DASHBOARD_STATS_TTL_MS = 60_000;
const dashboardStatsCache = new Map<string, { result: PulpDashboardStatsResult; loadedAt: number }>();
const dashboardStatsInFlight = new Map<string, Promise<PulpDashboardStatsResult>>();

// `admin` exists on every Pulp server, so the username alone would share one entry between them.
function dashboardStatsKey(auth: PulpAuth): string {
  return `${getPulpBaseUrl(auth)} ${auth.username}`;
}

function refreshPulpDashboardStats(auth: PulpAuth): Promise<PulpDashboardStatsResult> {
  const key = dashboardStatsKey(auth);
  const inFlight = dashboardStatsInFlight.get(key);
  if (inFlight) return inFlight;
  const refresh = loadPulpDashboardStats(auth)
    .then((result) => {
      // A failed load never replaces the last good result.
      if (result.ok) dashboardStatsCache.set(key, { result, loadedAt: Date.now() });
      return result;
    })
    .finally(() => dashboardStatsInFlight.delete(key));
  dashboardStatsInFlight.set(key, refresh);
  return refresh;
}

export function getCachedPulpDashboardStats(auth: PulpAuth): Promise<PulpDashboardStatsResult> {
  const entry = dashboardStatsCache.get(dashboardStatsKey(auth));
  if (!entry) return refreshPulpDashboardStats(auth);
  if (Date.now() - entry.loadedAt >= DASHBOARD_STATS_TTL_MS) {
    refreshPulpDashboardStats(auth).catch(() => {});
  }
  return Promise.resolve(entry.result);
}
