"use client";

import { FormEvent, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpGroups } from "@/components/pulp/use-pulp-groups";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { usePulpUsers } from "@/components/pulp/use-pulp-users";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { pulpTaskService } from "@/services/pulp/task-service";
import { PulpTaskPurgeResult, PulpTaskPurgeState } from "@/services/pulp/types";

/** Pulp only purges finished tasks (OpenAPI StatesEnum); running/waiting are not purgeable. */
const PURGE_STATES: { value: PulpTaskPurgeState; label: string }[] = [
  { value: "completed", label: "completed" },
  { value: "failed", label: "failed" },
  { value: "canceled", label: "canceled" },
  { value: "skipped", label: "skipped" },
];

function defaultFinishedBefore(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

export default function TaskPurgePage() {
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, setError, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);

  const [finishedBefore, setFinishedBefore] = useState(defaultFinishedBefore);
  const [states, setStates] = useState<PulpTaskPurgeState[]>(["completed"]);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<PulpTaskPurgeResult | null>(null);

  function toggleState(state: PulpTaskPurgeState, checked: boolean) {
    setStates((current) =>
      checked ? [...current, state] : current.filter((item) => item !== state)
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = finishedBefore.trim();
    if (!trimmed) {
      setError("A finished before date is required.");
      return;
    }
    if (states.length === 0) {
      setError("Select at least one task state to purge.");
      return;
    }

    const confirmed = window.confirm(
      `This permanently deletes ${states.join(", ")} tasks finished before ${trimmed}. Continue?`
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setResult(null);
    setIsRunning(true);
    try {
      const purgeResult = await pulpTaskService.purge({
        finished_before: trimmed,
        states,
      });
      if (!purgeResult.ok) {
        throw new Error(purgeResult.detail);
      }
      setResult(purgeResult.data);
    } catch (purgeError) {
      setError(purgeError instanceof Error ? purgeError.message : "Task purge failed.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <AdminShell
      title="Task Purge"
      description="Delete finished task records from the Pulp database."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading || isRunning}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      {isCheckingSession || isRedirectingToLogin ? (
        <Card>Checking existing session...</Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardTitle>Purge tasks</CardTitle>
            <CardContent>
              <form className="flex flex-col gap-4 md:max-w-md" onSubmit={handleSubmit}>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Permanently deletes task records that finished before the chosen date and are in
                  one of the selected states. Only the task history is removed; repositories,
                  content, and artifacts are untouched.
                </p>
                <FormField
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      Finished before
                      <InfoTooltip text="Only tasks that finished strictly before this date are purged. Tasks still running or waiting are never purged." />
                    </span>
                  }
                >
                  <Input
                    type="date"
                    value={finishedBefore}
                    onChange={(event) => setFinishedBefore(event.target.value)}
                  />
                </FormField>
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm">States</legend>
                  {PURGE_STATES.map((state) => (
                    <label
                      key={state.value}
                      className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0"
                        checked={states.includes(state.value)}
                        disabled={isRunning}
                        onChange={(event) => toggleState(state.value, event.target.checked)}
                      />
                      {state.label}
                    </label>
                  ))}
                </fieldset>
                <div>
                  <Button type="submit" disabled={isRunning}>
                    {isRunning ? "Purging..." : "Purge tasks"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {result ? (
            <div className="rounded-lg border border-emerald-300/80 bg-emerald-50/90 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/35">
              <p className="font-medium text-emerald-900 dark:text-emerald-100">
                Purge {result.state}
              </p>
              <p className="mt-1 break-all font-mono text-xs text-emerald-800/80 dark:text-emerald-300/70">
                Task: {result.task}
              </p>
              {result.progress_reports.length > 0 ? (
                <ul className="mt-2 space-y-1 text-emerald-800 dark:text-emerald-200/90">
                  {result.progress_reports.map((report, index) => (
                    <li key={`${report.code}-${index}`}>
                      {report.message}: {report.done}
                      {report.total ? ` / ${report.total}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </AdminShell>
  );
}
