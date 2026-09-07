import { unstable_cache } from "next/cache";
import { pulpFetch, type PulpAuth } from "@/lib/pulp";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
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

function failureFromSettled<TData>(
  result: PromiseSettledResult<PulpFetchResult<TData>>
): { detail: string; status?: number } | null {
  if (result.status === "rejected") {
    return { detail: result.reason instanceof Error ? result.reason.message : String(result.reason) };
  }
  return result.value.ok ? null : { detail: result.value.detail, status: result.value.status };
}

async function loadPulpDashboardStats(auth: PulpAuth): Promise<PulpDashboardStatsResult> {
  const [pluginsResult, usersResult, groupsResult, runningTasksResult, failedTasksResult, statusResult] =
    await Promise.allSettled([
      getPulpPluginRegistry(auth),
      pulpFetch<PulpCountListResponse>("/users/?limit=1&offset=0", auth),
      pulpFetch<PulpCountListResponse>("/groups/?limit=1&offset=0", auth),
      // state__in must be sent as repeated params -- a comma-joined value silently matches zero
      // tasks on this API.
      pulpFetch<PulpCountListResponse>("/tasks/?state__in=running&state__in=waiting&limit=1", auth),
      pulpFetch<PulpCountListResponse>("/tasks/?state=failed&limit=1", auth),
      pulpFetch<PulpStatus>("/status/", auth),
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

  const repoResults = await Promise.allSettled(
    plugins.map((plugin) =>
      pulpFetch<PulpCountListResponse>(`${plugin.repositoryPath}?limit=1&offset=0`, auth)
    )
  );

  const repositories: PulpDashboardRepositoryCount[] = plugins.map((plugin, index) => ({
    kind: plugin.kind,
    label: plugin.label,
    count: countFromSettled(repoResults[index]),
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

export function getCachedPulpDashboardStats(auth: PulpAuth): Promise<PulpDashboardStatsResult> {
  return unstable_cache(
    async () => loadPulpDashboardStats(auth),
    ["pulp-dashboard-stats", auth.username],
    { revalidate: 60, tags: ["pulp-dashboard"] }
  )();
}
