import { readApiDetail } from "./http";

const DASHBOARD_PATH = "/api/pulp/dashboard-summary";

export type PulpDashboardRepositoryCount = {
  kind: string;
  label: string;
  count: number | null;
};

export type PulpDashboardActivity = {
  runningTasks: number | null;
  failedTasks: number | null;
  onlineWorkers: number | null;
  onlineContentApps: number | null;
  onlineApiApps: number | null;
};

export type PulpDashboardSummary = {
  ok: true;
  usersCount: number | null;
  groupsCount: number | null;
  repositories: PulpDashboardRepositoryCount[];
  repositoriesTotal: number;
  activity: PulpDashboardActivity;
};

export const pulpDashboardService = {
  async summary(): Promise<PulpDashboardSummary> {
    const response = await fetch(DASHBOARD_PATH);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpDashboardSummary;
  },
};
