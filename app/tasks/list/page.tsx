"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpGroups } from "@/components/pulp/use-pulp-groups";
import { usePulpTasks } from "@/components/pulp/use-pulp-tasks";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { usePulpUsers } from "@/components/pulp/use-pulp-users";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { ListPagination } from "@/components/pulp/list-pagination";
import { ListQueryBar, SortableColumnHeader } from "@/components/pulp/list-query-bar";
import { usePulpListQuery } from "@/components/pulp/use-pulp-list-query";
import { buildPulpListParams } from "@/lib/pulp-list-query";
import { pulpTaskService } from "@/services/pulp/task-service";
import { PulpTask } from "@/services/pulp/types";

const PAGE_SIZE = 100;

/** Only these states can be canceled; Pulp rejects a cancel on anything finished. */
const CANCELABLE_STATES = ["running", "waiting"];

/** GET /tasks/ state filter enum, verified against the live server's OpenAPI spec. */
const TASK_STATES = [
  "canceled",
  "canceling",
  "completed",
  "failed",
  "running",
  "skipped",
  "waiting",
] as const;

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

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

function workerIdFromHref(href: string | null): string {
  if (!href) {
    return "—";
  }
  return taskIdFromHref(href);
}

function shortTaskName(name: string): string {
  const parts = name.split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : name;
}

/** "YYYY-MM-DD" from a date input to the ISO-8601 timestamp Pulp's date-range filters accept. */
function dateInputToIsoStart(value: string): string {
  return `${value}T00:00:00.000Z`;
}

function dateInputToIsoEnd(value: string): string {
  return `${value}T23:59:59.999Z`;
}

function TasksListPageContent() {
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, setError, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);
  const { query, setSearch, setOrdering, setPage, setPageSize, setQ } = usePulpListQuery({
    pageSize: PAGE_SIZE,
  });

  const [state, setState] = useState("");
  const [startedAfter, setStartedAfter] = useState("");
  const [startedBefore, setStartedBefore] = useState("");

  const params = useMemo(() => {
    const p = buildPulpListParams(query, { searchField: "name", searchLookup: "contains" });
    if (state) {
      p.set("state", state);
    }
    if (startedAfter) {
      p.set("started_at__gte", dateInputToIsoStart(startedAfter));
    }
    if (startedBefore) {
      p.set("started_at__lte", dateInputToIsoEnd(startedBefore));
    }
    return p;
  }, [query, state, startedAfter, startedBefore]);

  const { data, loading, totalPages, reload } = usePulpTasks(hasSession, params, query.pageSize);

  const [cancelModalTask, setCancelModalTask] = useState<PulpTask | null>(null);
  const [cancelingHref, setCancelingHref] = useState<string | null>(null);

  useEffect(() => {
    if (!data || totalPages < 1 || query.page <= totalPages) {
      return;
    }
    setPage(totalPages);
  }, [data, query.page, totalPages, setPage]);

  function handleStateChange(value: string) {
    setState(value);
    setPage(1);
  }

  function handleStartedAfterChange(value: string) {
    setStartedAfter(value);
    setPage(1);
  }

  function handleStartedBeforeChange(value: string) {
    setStartedBefore(value);
    setPage(1);
  }

  async function confirmCancel() {
    const task = cancelModalTask;
    if (!task) return;
    setCancelingHref(task.pulp_href);
    setError(null);
    try {
      const result = await pulpTaskService.cancel(task.pulp_href);
      if (!result.ok) {
        throw new Error(result.detail);
      }
      setCancelModalTask(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed.");
    } finally {
      setCancelingHref(null);
    }
  }

  const tasks = data?.results ?? [];
  const count = data?.count ?? 0;

  return (
    <AdminShell
      title="Task list"
      description="Pulp asynchronous tasks and status."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      {isCheckingSession || isRedirectingToLogin ? (
        <Card>Checking existing session...</Card>
      ) : (
        <Card>
          <CardTitle>
            Tasks
            {count > 0 ? (
              <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
                ({count.toLocaleString()} total)
              </span>
            ) : null}
          </CardTitle>
          <CardContent className="space-y-4">
            <ListQueryBar
              search={query.search}
              onSearchChange={setSearch}
              pageSize={query.pageSize}
              onPageSizeChange={setPageSize}
              disabled={loading}
              searchPlaceholder="Search by task name"
              q={query.q}
              onQChange={setQ}
            />
            <div className="flex flex-wrap items-end gap-3">
              <FormField label="State">
                <select
                  value={state}
                  onChange={(event) => handleStateChange(event.target.value)}
                  disabled={loading}
                  className={selectClassName}
                >
                  <option value="">All states</option>
                  {TASK_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Started after">
                <input
                  type="date"
                  value={startedAfter}
                  onChange={(event) => handleStartedAfterChange(event.target.value)}
                  disabled={loading}
                  className={selectClassName}
                />
              </FormField>
              <FormField label="Started before">
                <input
                  type="date"
                  value={startedBefore}
                  onChange={(event) => handleStartedBeforeChange(event.target.value)}
                  disabled={loading}
                  className={selectClassName}
                />
              </FormField>
            </div>

            <TableWrapper>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>
                      <SortableColumnHeader
                        label="State"
                        field="state"
                        ordering={query.ordering}
                        onSort={setOrdering}
                      />
                    </TableHeaderCell>
                    <TableHeaderCell>Task</TableHeaderCell>
                    <TableHeaderCell>
                      <SortableColumnHeader
                        label="Name"
                        field="name"
                        ordering={query.ordering}
                        onSort={setOrdering}
                      />
                    </TableHeaderCell>
                    <TableHeaderCell>
                      <SortableColumnHeader
                        label="Created"
                        field="pulp_created"
                        ordering={query.ordering}
                        onSort={setOrdering}
                      />
                    </TableHeaderCell>
                    <TableHeaderCell>
                      <SortableColumnHeader
                        label="Started"
                        field="started_at"
                        ordering={query.ordering}
                        onSort={setOrdering}
                      />
                    </TableHeaderCell>
                    <TableHeaderCell>
                      <SortableColumnHeader
                        label="Finished"
                        field="finished_at"
                        ordering={query.ordering}
                        onSort={setOrdering}
                      />
                    </TableHeaderCell>
                    <TableHeaderCell>Worker</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && tasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-zinc-500">
                        Loading tasks…
                      </TableCell>
                    </TableRow>
                  ) : !loading && tasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-zinc-500">
                        No tasks on this page.
                      </TableCell>
                    </TableRow>
                  ) : (
                    tasks.map((t) => (
                      <TableRow key={t.pulp_href} frozen={cancelingHref === t.pulp_href}>
                        <TableCell>
                          <span
                            className={cn(
                              "rounded-md px-2 py-0.5 text-xs font-medium",
                              t.state === "completed" &&
                                "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
                              t.state === "failed" &&
                                "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
                              t.state === "running" &&
                                "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
                              t.state === "waiting" &&
                                "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
                              !["completed", "failed", "running", "waiting"].includes(t.state) &&
                                "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                            )}
                          >
                            {t.state}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                          {taskIdFromHref(t.pulp_href)}
                        </TableCell>
                        <TableCell className="max-w-[18rem] truncate font-mono text-xs" title={t.name}>
                          {shortTaskName(t.name)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatIso(t.pulp_created)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatIso(t.started_at)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatIso(t.finished_at)}
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate font-mono text-xs">
                          {workerIdFromHref(t.worker)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Link
                              href={`/tasks/detail?pulp_href=${encodeURIComponent(t.pulp_href)}`}
                              className="inline-flex rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                            >
                              Details
                            </Link>
                            {CANCELABLE_STATES.includes(t.state) ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="px-2.5 py-1 text-xs border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                                disabled={cancelingHref === t.pulp_href}
                                onClick={() => setCancelModalTask(t)}
                              >
                                Cancel
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableWrapper>

            <ListPagination
              page={query.page}
              totalPages={totalPages}
              onPageChange={setPage}
              disabled={loading}
            />
          </CardContent>
        </Card>
      )}

      {cancelModalTask ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/50 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && cancelingHref === null) {
              setCancelModalTask(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Cancel task ${taskIdFromHref(cancelModalTask.pulp_href)}`}
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Cancel task</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                {shortTaskName(cancelModalTask.name)}
              </span>
              <span className="mt-1 block break-all font-mono text-xs text-zinc-500">
                {cancelModalTask.pulp_href}
              </span>
            </p>
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Work already done by the task is not rolled back. A task that finished before the
              request reaches Pulp cannot be canceled.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={cancelingHref !== null}
                onClick={() => setCancelModalTask(null)}
              >
                Keep running
              </Button>
              <Button
                type="button"
                className="border-red-300 bg-red-600 text-white hover:bg-red-700 dark:border-red-800 dark:bg-red-700 dark:hover:bg-red-600"
                disabled={cancelingHref !== null}
                onClick={() => void confirmCancel()}
              >
                {cancelingHref !== null ? "Canceling…" : "Cancel task"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

function TasksListSuspenseFallback() {
  const { sessionUser, isLoading, hasSession, error, logout } = usePulpAuthContext();
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);

  return (
    <AdminShell
      title="Task list"
      description="Pulp asynchronous tasks and status."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      <Card>Loading task list…</Card>
    </AdminShell>
  );
}

export default function TasksListPage() {
  return (
    <Suspense fallback={<TasksListSuspenseFallback />}>
      <TasksListPageContent />
    </Suspense>
  );
}
