"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  CloudCog,
  Cpu,
  Globe,
  LayoutDashboard,
  Loader2,
  Package,
  Server,
  Shield,
  Upload,
  Users,
  UsersRound,
} from "lucide-react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpGroups } from "@/components/pulp/use-pulp-groups";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { usePulpUsers } from "@/components/pulp/use-pulp-users";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import {
  pulpDashboardService,
  type PulpDashboardSummary,
} from "@/services/pulp/dashboard-service";

type QuickLink = {
  href: string;
  label: string;
  description: string;
  icon: typeof Users;
};

const quickLinks: QuickLink[] = [
  {
    href: "/users/list",
    label: "Users",
    description: "Accounts and permissions",
    icon: Users,
  },
  {
    href: "/groups/list",
    label: "Groups",
    description: "Access groups",
    icon: UsersRound,
  },
  {
    href: "/roles/list",
    label: "Roles",
    description: "RBAC roles and permissions",
    icon: Shield,
  },
  {
    href: "/repositories/list",
    label: "Repositories",
    description: "RPM, Debian, and File",
    icon: Boxes,
  },
  {
    href: "/content/list",
    label: "Content",
    description: "Packages and metadata",
    icon: Package,
  },
  {
    href: "/uploads/create",
    label: "Upload",
    description: "Send artifacts to Pulp",
    icon: Upload,
  },
  {
    href: "/tasks/list",
    label: "Tasks",
    description: "Async task history and status",
    icon: ClipboardList,
  },
  {
    href: "/task-schedules/list",
    label: "Task schedules",
    description: "Periodic dispatch and Celery beat",
    icon: CalendarClock,
  },
  {
    href: "/workers/list",
    label: "Workers",
    description: "Task workers and heartbeats",
    icon: Cpu,
  },
];

type StatConfig = {
  key: keyof Pick<PulpDashboardSummary, "usersCount" | "groupsCount">;
  label: string;
  icon: typeof Users;
  iconWrap: string;
};

const statCards: StatConfig[] = [
  {
    key: "usersCount",
    label: "Users",
    icon: Users,
    iconWrap: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  },
  {
    key: "groupsCount",
    label: "Groups",
    icon: UsersRound,
    iconWrap: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
];

// One neutral style for every repository family card (and the empty-state notice below it).
// PulpPluginDescriptor carries no icon or colour, so per-kind styling would mean a second
// hardcoded per-kind table alongside the plugin registry -- deliberately not done here.
const REPOSITORY_CARD_ICON_WRAP =
  "bg-zinc-100 text-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300";

const NEUTRAL_ICON_WRAP = "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300";
const BAD_ICON_WRAP = "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300";

type ActivityTileConfig = {
  key: keyof PulpDashboardSummary["activity"];
  label: string;
  icon: typeof Users;
  href: string;
  /** Hide the tile once the value is confirmed to be zero, not just while it's unavailable. */
  hideAtZero?: boolean;
  /** A value of exactly zero is the bad outcome for this signal (e.g. no online apps). */
  badAtZero?: boolean;
};

// The dashboard summarizes server activity; /status has the per-worker detail, so every tile
// here links out to either /tasks/list or /status instead of rendering a table.
const activityTiles: ActivityTileConfig[] = [
  { key: "failedTasks", label: "Failed tasks", icon: AlertTriangle, href: "/tasks/list" },
  {
    key: "runningTasks",
    label: "Running or waiting tasks",
    icon: Activity,
    href: "/tasks/list",
    hideAtZero: true,
  },
  { key: "onlineWorkers", label: "Online workers", icon: Cpu, href: "/status", badAtZero: true },
  {
    key: "onlineContentApps",
    label: "Online content apps",
    icon: Server,
    href: "/status",
    badAtZero: true,
  },
  { key: "onlineApiApps", label: "Online API apps", icon: Globe, href: "/status", badAtZero: true },
];

export default function DashboardPage() {
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);

  const [summary, setSummary] = useState<PulpDashboardSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Hide a family once we know for certain it has zero repositories; a null count means the
  // family's total could not be loaded and still renders as unavailable, not as absent.
  const visibleRepositories = summary
    ? summary.repositories.filter((repo) => repo.count !== 0)
    : [];
  const allRepositoriesEmpty = summary
    ? summary.repositories.length > 0 && visibleRepositories.length === 0
    : false;

  // Same precedent as visibleRepositories above: hide a tile once its value is confirmed zero,
  // but keep it while the value is null (unavailable) or positive.
  const visibleActivityTiles = summary
    ? activityTiles.filter((tile) => !(tile.hideAtZero && summary.activity[tile.key] === 0))
    : [];

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      if (!hasSession) {
        return;
      }

      try {
        const data = await pulpDashboardService.summary();
        if (active) {
          setSummary(data);
          setSummaryError(null);
        }
      } catch (err) {
        if (active) {
          setSummary(null);
          setSummaryError(err instanceof Error ? err.message : "Failed to load dashboard stats.");
        }
      }
    }

    void loadSummary();

    return () => {
      active = false;
    };
  }, [hasSession]);

  return (
    <AdminShell
      title="Dashboard"
      description="Overview of your Pulp server. Summary counts are cached on the server for about a minute."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      {isCheckingSession || isRedirectingToLogin ? (
        <Card className="flex items-center gap-3 py-6">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-zinc-400" aria-hidden />
          <div>
            <p className="font-medium text-zinc-900 dark:text-zinc-100">Checking session</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Verifying your Pulp connection…</p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex gap-3 rounded-lg border border-sky-200/90 bg-sky-50/90 px-4 py-3 text-sm text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/35 dark:text-sky-100">
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-200/80 text-sky-900 dark:bg-sky-900/60 dark:text-sky-100"
              aria-hidden
            >
              <CloudCog className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div>
              <p className="font-medium">Server-side cache</p>
              <p className="mt-1 text-sky-900/90 dark:text-sky-200/90">
                Totals below are served from a short-lived server cache (60s revalidation) so
                repeated visits stay fast. Navigate away and back to pick up the latest counts sooner.
              </p>
            </div>
          </div>

          {hasSession && summaryError ? (
            <Card className="border-amber-300 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30">
              <div className="flex gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-200/80 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100"
                  aria-hidden
                >
                  <AlertTriangle className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <CardTitle>Summary</CardTitle>
                  <p className="mt-2 text-sm text-amber-900 dark:text-amber-200">{summaryError}</p>
                </div>
              </div>
            </Card>
          ) : null}

          {hasSession && summary ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {statCards.map(({ key, label, icon: Icon, iconWrap }) => (
                  <Card
                    key={key}
                    className="overflow-hidden border-zinc-200/90 shadow-sm dark:border-zinc-800/90"
                  >
                    <CardContent className="flex items-start gap-3 p-4 pt-4">
                      <span
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                          iconWrap
                        )}
                        aria-hidden
                      >
                        <Icon className="h-5 w-5" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                          {label}
                        </p>
                        <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                          {summary[key] ?? "—"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {visibleRepositories.map((repo) => (
                  <Card
                    key={repo.kind}
                    className="overflow-hidden border-zinc-200/90 shadow-sm dark:border-zinc-800/90"
                  >
                    <CardContent className="flex items-start gap-3 p-4 pt-4">
                      <span
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                          REPOSITORY_CARD_ICON_WRAP
                        )}
                        aria-hidden
                      >
                        <Boxes className="h-5 w-5" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                          {repo.label} repositories
                        </p>
                        <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
                          {repo.count ?? "—"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {allRepositoriesEmpty ? (
                <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800/90">
                  <div className="flex gap-3">
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        REPOSITORY_CARD_ICON_WRAP
                      )}
                      aria-hidden
                    >
                      <Boxes className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <CardTitle>Repositories</CardTitle>
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                        This server has no repositories yet. Create one on the{" "}
                        <Link href="/repositories/list" className="underline underline-offset-2">
                          Repositories
                        </Link>{" "}
                        page.
                      </p>
                    </div>
                  </div>
                </Card>
              ) : null}

              <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800/90">
                <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 pb-3 pt-4 dark:border-zinc-800/80">
                  <div className="flex items-center gap-2">
                    <Activity className="h-5 w-5 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden />
                    <CardTitle className="mb-0">Activity</CardTitle>
                  </div>
                  <Link
                    href="/status"
                    className="flex items-center gap-1 text-sm text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    Full status
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
                <CardContent className="grid gap-4 p-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleActivityTiles.map((tile) => {
                    const value = summary.activity[tile.key];
                    const isBad =
                      tile.key === "failedTasks"
                        ? value !== null && value > 0
                        : Boolean(tile.badAtZero) && value === 0;
                    const Icon = tile.icon;
                    return (
                      <Link
                        key={tile.key}
                        href={tile.href}
                        className={cn(
                          "flex items-start gap-3 rounded-xl border p-4 transition hover:shadow-sm",
                          isBad
                            ? "border-red-300 bg-red-50/70 hover:border-red-400 dark:border-red-900/60 dark:bg-red-950/20"
                            : "border-zinc-200/90 bg-white/70 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950/50 dark:hover:border-zinc-600"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                            isBad ? BAD_ICON_WRAP : NEUTRAL_ICON_WRAP
                          )}
                          aria-hidden
                        >
                          <Icon className="h-5 w-5" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                            {tile.label}
                          </p>
                          <p
                            className={cn(
                              "mt-1 text-3xl font-semibold tabular-nums tracking-tight",
                              isBad
                                ? "text-red-700 dark:text-red-300"
                                : "text-zinc-900 dark:text-zinc-50"
                            )}
                          >
                            {value ?? "—"}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </CardContent>
              </Card>
            </>
          ) : !summaryError && hasSession ? (
            <Card className="flex items-center gap-3 py-8">
              <Loader2 className="h-6 w-6 shrink-0 animate-spin text-sky-500 dark:text-sky-400" aria-hidden />
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">Loading summary</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Fetching counts from Pulp…</p>
              </div>
            </Card>
          ) : null}

          <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800/90">
            <div className="flex items-center gap-2 border-b border-zinc-100 px-4 pb-3 pt-4 dark:border-zinc-800/80">
              <LayoutDashboard className="h-5 w-5 shrink-0 text-zinc-500 dark:text-zinc-400" aria-hidden />
              <CardTitle className="mb-0">Shortcuts</CardTitle>
            </div>
            <CardContent className="pb-6 pt-5">
              <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5">
                {quickLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white/70 p-4 transition hover:border-zinc-300 hover:bg-white hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950/50 dark:hover:border-zinc-600 dark:hover:bg-zinc-900/90"
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 transition group-hover:bg-zinc-200/90 group-hover:text-zinc-900 dark:bg-zinc-800/80 dark:text-zinc-300 dark:group-hover:bg-zinc-800 dark:group-hover:text-zinc-100"
                          aria-hidden
                        >
                          <Icon className="h-5 w-5" strokeWidth={1.65} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {item.label}
                          </span>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.description}</p>
                        </div>
                        <ChevronRight
                          className="h-5 w-5 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500 dark:text-zinc-600 dark:group-hover:text-zinc-400"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </AdminShell>
  );
}
