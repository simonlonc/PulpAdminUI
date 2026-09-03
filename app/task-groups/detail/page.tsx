"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpGroups } from "@/components/pulp/use-pulp-groups";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { usePulpUsers } from "@/components/pulp/use-pulp-users";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";
import { pulpTaskGroupService } from "@/services/pulp/task-group-service";
import type { PulpTaskGroup } from "@/services/pulp/types";

function formatIso(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString();
}

function shortTaskName(name: string): string {
  const parts = name.split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : name;
}

function TaskGroupDetailInner() {
  const searchParams = useSearchParams();
  const pulpHref = searchParams.get("pulp_href")?.trim() ?? "";

  const { sessionUser, isLoading, isCheckingSession, hasSession, error, setError, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);

  const [group, setGroup] = useState<PulpTaskGroup | null>(null);
  const [isLoadingGroup, setIsLoadingGroup] = useState(false);

  const load = useCallback(async () => {
    if (!hasSession || !pulpHref) {
      setGroup(null);
      return;
    }
    setIsLoadingGroup(true);
    setError(null);
    try {
      const data = await pulpTaskGroupService.get(pulpHref);
      setGroup(data);
    } catch (e) {
      setGroup(null);
      setError(e instanceof Error ? e.message : "Failed to load task group.");
    } finally {
      setIsLoadingGroup(false);
    }
  }, [hasSession, pulpHref, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminShell
      title="Task group detail"
      description="Member tasks and progress for a single Pulp task group."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading || isLoadingGroup}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      {isCheckingSession || isRedirectingToLogin ? (
        <Card>Checking existing session...</Card>
      ) : !pulpHref ? (
        <Card>Missing pulp_href query parameter (use a group href from the task group list).</Card>
      ) : !group && !isLoadingGroup ? (
        <Card>Task group not found or could not be loaded.</Card>
      ) : group ? (
        <div className="space-y-4">
          <Card>
            <CardTitle>{group.description}</CardTitle>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">pulp_href</p>
                <p className="break-all font-mono text-xs">{group.pulp_href}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  All tasks dispatched
                </p>
                <p>{group.all_tasks_dispatched ? "yes" : "no"}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Waiting</p>
                  <p>{group.waiting}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Running</p>
                  <p>{group.running}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Completed
                  </p>
                  <p>{group.completed}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Failed</p>
                  <p>{group.failed}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Canceling
                  </p>
                  <p>{group.canceling}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Canceled
                  </p>
                  <p>{group.canceled}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Skipped</p>
                  <p>{group.skipped}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardTitle>Group progress reports</CardTitle>
            <CardContent className="text-sm">
              {group.group_progress_reports.length === 0 ? (
                <p className="text-zinc-500 dark:text-zinc-400">No group progress reports.</p>
              ) : (
                <ul className="space-y-1">
                  {group.group_progress_reports.map((report, index) => (
                    <li key={`${report.code}-${index}`}>
                      {report.message}: {report.done}
                      {report.total ? ` / ${report.total}` : ""}
                      {report.suffix ? ` ${report.suffix}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardTitle>Tasks ({group.tasks.length})</CardTitle>
            <CardContent>
              <TableWrapper>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>State</TableHeaderCell>
                      <TableHeaderCell>Name</TableHeaderCell>
                      <TableHeaderCell>Started</TableHeaderCell>
                      <TableHeaderCell>Finished</TableHeaderCell>
                      <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {group.tasks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-zinc-500">
                          No tasks in this group.
                        </TableCell>
                      </TableRow>
                    ) : (
                      group.tasks.map((task) => (
                        <TableRow key={task.pulp_href}>
                          <TableCell>
                            <span
                              className={cn(
                                "rounded-md px-2 py-0.5 text-xs font-medium",
                                task.state === "completed" &&
                                  "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
                                task.state === "failed" &&
                                  "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
                                task.state === "running" &&
                                  "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
                                task.state === "waiting" &&
                                  "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
                                !["completed", "failed", "running", "waiting"].includes(task.state) &&
                                  "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                              )}
                            >
                              {task.state}
                            </span>
                          </TableCell>
                          <TableCell
                            className="max-w-[18rem] truncate font-mono text-xs"
                            title={task.name}
                          >
                            {shortTaskName(task.name)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatIso(task.started_at)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatIso(task.finished_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Link
                              href={`/tasks/detail?pulp_href=${encodeURIComponent(task.pulp_href)}`}
                              className="inline-flex rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                            >
                              Details
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableWrapper>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/task-groups/list"
              className="inline-flex rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Task groups
            </Link>
            <Button
              type="button"
              variant="outline"
              disabled={isLoadingGroup}
              onClick={() => void load()}
            >
              Refresh
            </Button>
          </div>
        </div>
      ) : (
        <Card>Loading…</Card>
      )}
    </AdminShell>
  );
}

export default function TaskGroupDetailPage() {
  return (
    <Suspense fallback={<Card className="p-6">Loading…</Card>}>
      <TaskGroupDetailInner />
    </Suspense>
  );
}
