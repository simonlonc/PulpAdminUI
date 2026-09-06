"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpPluginsContext } from "@/components/pulp/plugins-context";
import { usePulpGroups } from "@/components/pulp/use-pulp-groups";
import { usePulpRepositoryOptions } from "@/components/pulp/use-pulp-repository-options";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { usePulpUsers } from "@/components/pulp/use-pulp-users";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { CheckboxField, FormField } from "@/components/ui/form-field";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { pulpReclaimService } from "@/services/pulp/reclaim-service";
import { PulpReclaimSpaceResult } from "@/services/pulp/types";

const textareaClass =
  "min-h-[7rem] w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 font-mono text-xs dark:border-zinc-700";

function linesFromTextarea(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function ReclaimSpacePage() {
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, setError, logout } =
    usePulpAuthContext();
  const { getPlugin } = usePulpPluginsContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);
  const { repositoryOptions } = usePulpRepositoryOptions(hasSession);

  const [selectedHrefs, setSelectedHrefs] = useState<Set<string>>(new Set());
  const [allRepositories, setAllRepositories] = useState(false);
  const [keeplistText, setKeeplistText] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<PulpReclaimSpaceResult | null>(null);

  function toggleRepository(href: string, checked: boolean) {
    setSelectedHrefs((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(href);
      } else {
        next.delete(href);
      }
      return next;
    });
  }

  function toggleAllRepositories(checked: boolean) {
    setAllRepositories(checked);
    if (checked) {
      setSelectedHrefs(new Set());
    }
  }

  const canSubmit = allRepositories || selectedHrefs.size > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    const confirmMessage = allRepositories
      ? "This permanently deletes the artifacts on disk for every repository version on this server (all repositories selected). Repository metadata is kept, but content must be re-synced or re-uploaded before it can be used again. Continue?"
      : `This permanently deletes the artifacts on disk for the ${selectedHrefs.size} selected repositor${
          selectedHrefs.size === 1 ? "y" : "ies"
        }' versions. Repository metadata is kept, but content must be re-synced or re-uploaded before it can be used again. Continue?`;
    const confirmed = window.confirm(confirmMessage);
    if (!confirmed) {
      return;
    }

    setError(null);
    setResult(null);
    setIsRunning(true);
    try {
      const repoHrefs = allRepositories ? ["*"] : Array.from(selectedHrefs);
      const reclaimResult = await pulpReclaimService.reclaim(repoHrefs, linesFromTextarea(keeplistText));
      if (!reclaimResult.ok) {
        throw new Error(reclaimResult.detail);
      }
      setResult(reclaimResult.data);
    } catch (reclaimError) {
      setError(reclaimError instanceof Error ? reclaimError.message : "Reclaim space failed.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <AdminShell
      title="Reclaim Disk Space"
      description="Free the disk space used by a repository's artifacts while keeping its metadata."
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
            <CardTitle>Reclaim space</CardTitle>
            <CardContent>
              <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Deletes artifacts on disk for the selected repositories&apos; versions while keeping
                  repository and content metadata. Reclaimed content must be re-synced or re-uploaded
                  before it can be used again. This runs as a Pulp task and can take a while on large
                  installations.
                </p>

                <CheckboxField label="All repositories (every repository on the server)">
                  <Input
                    type="checkbox"
                    className="h-4 w-4 rounded border-zinc-300 p-0 dark:border-zinc-700"
                    checked={allRepositories}
                    onChange={(event) => toggleAllRepositories(event.target.checked)}
                    disabled={isRunning}
                  />
                </CheckboxField>

                <FormField label="Repositories">
                  <div
                    className={`flex max-h-64 flex-col gap-1.5 overflow-y-auto rounded-md border border-zinc-300 p-3 dark:border-zinc-700 ${
                      allRepositories ? "opacity-50" : ""
                    }`}
                  >
                    {repositoryOptions.length === 0 ? (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">No repositories found.</p>
                    ) : (
                      repositoryOptions.map((option) => (
                        <CheckboxField key={option.href} label={`${option.name} (${getPlugin(option.kind).label})`}>
                          <Input
                            type="checkbox"
                            className="h-4 w-4 rounded border-zinc-300 p-0 dark:border-zinc-700"
                            checked={selectedHrefs.has(option.href)}
                            onChange={(event) => toggleRepository(option.href, event.target.checked)}
                            disabled={isRunning || allRepositories}
                          />
                        </CheckboxField>
                      ))
                    )}
                  </div>
                </FormField>

                <FormField
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      Versions to keep
                      <InfoTooltip text="Repository VERSION hrefs to exclude from reclaim, one per line. Artifacts belonging to these versions are kept even though their repository is selected above." />
                    </span>
                  }
                >
                  <textarea
                    className={textareaClass}
                    value={keeplistText}
                    onChange={(event) => setKeeplistText(event.target.value)}
                    disabled={isRunning}
                    placeholder={"/pulp/api/v3/repositories/file/file/.../versions/3/"}
                  />
                </FormField>

                <div>
                  <Button type="submit" disabled={isRunning || !canSubmit}>
                    {isRunning ? "Reclaiming..." : "Reclaim space"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {result ? (
            <div className="rounded-lg border border-emerald-300/80 bg-emerald-50/90 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/35">
              <p className="font-medium text-emerald-900 dark:text-emerald-100">
                Reclaim {result.state}
              </p>
              <p className="mt-1 break-all font-mono text-xs text-emerald-800/80 dark:text-emerald-300/70">
                Task:{" "}
                <Link
                  href={`/tasks/detail?pulp_href=${encodeURIComponent(result.task)}`}
                  className="underline decoration-emerald-400 underline-offset-2"
                >
                  {result.task}
                </Link>
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
