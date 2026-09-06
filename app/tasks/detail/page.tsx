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
import { pulpTaskService } from "@/services/pulp/task-service";
import type { PulpTask } from "@/services/pulp/types";

const CANCELABLE_STATES = ["running", "waiting"];

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

function taskIdFromHref(href: string): string {
  const trimmed = href.replace(/\/+$/, "");
  const last = trimmed.split("/").pop();
  return last && last.length > 0 ? last : href;
}

function formatError(error: unknown): string | null {
  if (error === null || error === undefined) {
    return null;
  }
  if (typeof error === "string") {
    return error;
  }
  const o = error as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof o.description === "string") {
    parts.push(o.description);
  }
  if (Array.isArray(o.traceback)) {
    parts.push(o.traceback.map(String).join(""));
  } else if (typeof o.traceback === "string") {
    parts.push(o.traceback);
  }
  return parts.length > 0 ? parts.join("\n\n") : JSON.stringify(error, null, 2);
}

function TaskDetailInner() {
  const searchParams = useSearchParams();
  const pulpHref = searchParams.get("pulp_href")?.trim() ?? "";

  const { sessionUser, isLoading, isCheckingSession, hasSession, error, setError, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);

  const [task, setTask] = useState<PulpTask | null>(null);
  const [isLoadingTask, setIsLoadingTask] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  const load = useCallback(async () => {
    if (!hasSession || !pulpHref) {
      setTask(null);
      return;
    }
    setIsLoadingTask(true);
    setError(null);
    try {
      const data = await pulpTaskService.get(pulpHref);
      setTask(data);
    } catch (e) {
      setTask(null);
      setError(e instanceof Error ? e.message : "Failed to load task.");
    } finally {
      setIsLoadingTask(false);
    }
  }, [hasSession, pulpHref, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  // A running task changes state server-side; refresh until it settles.
  useEffect(() => {
    if (!task || !CANCELABLE_STATES.includes(task.state)) {
      return;
    }
    const timer = setInterval(() => {
      void load();
    }, 5000);
    return () => {
      clearInterval(timer);
    };
  }, [task, load]);

  async function handleCancel() {
    if (!task) return;
    if (
      !window.confirm(
        `Cancel task ${taskIdFromHref(task.pulp_href)}? Work already done is not rolled back.`
      )
    ) {
      return;
    }
    setError(null);
    setIsCanceling(true);
    try {
      const result = await pulpTaskService.cancel(task.pulp_href);
      if (!result.ok) {
        throw new Error(result.detail);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed.");
    } finally {
      setIsCanceling(false);
    }
  }

  const taskError = task ? formatError(task.error) : null;

  return (
    <AdminShell
      title="Task detail"
      description="Single Pulp task: state, timing, progress, created resources, and errors."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading || isLoadingTask || isCanceling}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      {isCheckingSession || isRedirectingToLogin ? (
        <Card>Checking existing session...</Card>
      ) : !pulpHref ? (
        <Card>Missing pulp_href query parameter (use a task href from the task list).</Card>
      ) : !task && !isLoadingTask ? (
        <Card>Task not found or could not be loaded.</Card>
      ) : task ? (
        <div className="space-y-4">
          <Card>
            <CardTitle>
              <span
                className={cn(
                  "mr-2 rounded-md px-2 py-0.5 text-xs font-medium",
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
              {taskIdFromHref(task.pulp_href)}
            </CardTitle>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Name</p>
                <p className="break-all font-mono text-xs">{task.name}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">pulp_href</p>
                <p className="break-all font-mono text-xs">{task.pulp_href}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Logging CID
                </p>
                <p className="break-all font-mono text-xs">{task.logging_cid || "—"}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Created</p>
                  <p>{formatIso(task.pulp_created)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Started</p>
                  <p>{formatIso(task.started_at)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Finished
                  </p>
                  <p>{formatIso(task.finished_at)}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Worker</p>
                <p className="break-all font-mono text-xs">{task.worker ?? "—"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardTitle>Relations</CardTitle>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Parent task
                </p>
                {task.parent_task ? (
                  <Link
                    href={`/tasks/detail?pulp_href=${encodeURIComponent(task.parent_task)}`}
                    className="break-all font-mono text-xs underline underline-offset-2"
                  >
                    {task.parent_task}
                  </Link>
                ) : (
                  <p>—</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Child tasks
                </p>
                {task.child_tasks.length === 0 ? (
                  <p>—</p>
                ) : (
                  <ul className="space-y-1">
                    {task.child_tasks.map((child) => (
                      <li key={child}>
                        <Link
                          href={`/tasks/detail?pulp_href=${encodeURIComponent(child)}`}
                          className="break-all font-mono text-xs underline underline-offset-2"
                        >
                          {child}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Task group
                </p>
                {task.task_group ? (
                  <Link
                    href={`/task-groups/detail?pulp_href=${encodeURIComponent(task.task_group)}`}
                    className="break-all font-mono text-xs underline underline-offset-2"
                  >
                    {task.task_group}
                  </Link>
                ) : (
                  <p>—</p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Created resources
                </p>
                {task.created_resources.length === 0 ? (
                  <p>—</p>
                ) : (
                  <ul className="space-y-1">
                    {task.created_resources.map((resource) => (
                      <li key={resource} className="break-all font-mono text-xs">
                        {resource}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Reserved resources
                </p>
                {task.reserved_resources_record.length === 0 ? (
                  <p>—</p>
                ) : (
                  <ul className="space-y-1">
                    {task.reserved_resources_record.map((resource) => (
                      <li key={resource} className="break-all font-mono text-xs">
                        {resource}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardTitle>Progress reports</CardTitle>
            <CardContent className="text-sm">
              {task.progress_reports.length === 0 ? (
                <p className="text-zinc-500 dark:text-zinc-400">No progress reports.</p>
              ) : (
                <ul className="space-y-1">
                  {task.progress_reports.map((report, index) => (
                    <li key={`${report.code}-${index}`}>
                      {report.message}: {report.done}
                      {report.total ? ` / ${report.total}` : ""}
                      {report.suffix ? ` ${report.suffix}` : ""}
                      <span className="ml-2 text-xs text-zinc-500">{report.state}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {taskError ? (
            <Card className="border-red-300/80 dark:border-red-800">
              <CardTitle className="text-red-900 dark:text-red-200">Error</CardTitle>
              <CardContent>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-red-50/80 p-3 font-mono text-xs text-red-900 dark:bg-red-950/35 dark:text-red-200">
                  {taskError}
                </pre>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Link
              href="/tasks/list"
              className="inline-flex rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Task list
            </Link>
            <Button type="button" variant="outline" disabled={isLoadingTask} onClick={() => void load()}>
              Refresh
            </Button>
            {CANCELABLE_STATES.includes(task.state) ? (
              <Button
                type="button"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                disabled={isCanceling}
                onClick={() => void handleCancel()}
              >
                {isCanceling ? "Canceling…" : "Cancel task"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <Card>Loading…</Card>
      )}
    </AdminShell>
  );
}

export default function TaskDetailPage() {
  return (
    <Suspense fallback={<Card className="p-6">Loading…</Card>}>
      <TaskDetailInner />
    </Suspense>
  );
}
