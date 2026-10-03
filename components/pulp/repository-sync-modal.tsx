"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePulpAuthContext } from "./auth-context";
import { usePulpPluginsContext } from "./plugins-context";
import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { type PulpPluginKind, type PulpSyncField, getBaseFieldHint } from "@/lib/pulp-plugins";
import {
  DOWNLOAD_CONCURRENCY_MINIMUM,
  numericProblem,
  parseIntegerInput,
} from "@/lib/remote-form";
import { pulpRemoteService } from "@/services/pulp/remote-service";
import { pulpRepositoryManagementService } from "@/services/pulp/repository-management-service";
import { PulpRemote, PulpRepository } from "@/services/pulp/types";

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

/** Initial sync modal values: each field's `default`, else false, the first option, or []. */
function defaultSyncFieldValues(
  fields: readonly PulpSyncField[]
): Record<string, boolean | string | string[]> {
  const values: Record<string, boolean | string | string[]> = {};
  for (const field of fields) {
    if (field.type === "boolean") {
      values[field.name] = field.default === undefined ? false : Boolean(field.default);
    } else if (field.type === "enum") {
      values[field.name] =
        typeof field.default === "string" ? field.default : (field.options?.[0] ?? "");
    } else {
      values[field.name] = [];
    }
  }
  return values;
}

function numberText(value: number | null | undefined): string {
  return typeof value === "number" ? String(value) : "";
}

export type RepositorySyncModalProps = {
  repo: PulpRepository;
  kind: PulpPluginKind;
  onClose: () => void;
  onSynced: (result: { repoName: string; task: string | null }) => void;
  onBusyChange: (busy: boolean) => void;
};

export function RepositorySyncModal({
  repo,
  kind,
  onClose,
  onSynced,
  onBusyChange,
}: RepositorySyncModalProps) {
  const { setError } = usePulpAuthContext();
  const { getPlugin } = usePulpPluginsContext();

  const [remotes, setRemotes] = useState<PulpRemote[]>([]);
  const [isLoadingRemotes, setIsLoadingRemotes] = useState(false);
  const [syncRemoteHref, setSyncRemoteHref] = useState("");
  const [syncFieldValues, setSyncFieldValues] = useState<
    Record<string, boolean | string | string[]>
  >(() => defaultSyncFieldValues(getPlugin(kind).syncFields));
  const [downloadConcurrency, setDownloadConcurrency] = useState("");
  const [rateLimit, setRateLimit] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const plugin = getPlugin(kind);

  useEffect(() => {
    let active = true;
    setError(null);
    setIsLoadingRemotes(true);
    void (async () => {
      try {
        const result = await pulpRemoteService.list(kind);
        if (active) {
          setRemotes(result.results);
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : "Failed to load remotes.");
          setRemotes([]);
        }
      } finally {
        if (active) {
          setIsLoadingRemotes(false);
        }
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSyncing) {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isSyncing, onClose]);

  function close() {
    if (isSyncing) return;
    onClose();
  }

  function selectRemote(href: string) {
    const remote = remotes.find((r) => r.pulp_href === href);
    setSyncRemoteHref(href);
    setDownloadConcurrency(numberText(remote?.download_concurrency));
    setRateLimit(numberText(remote?.rate_limit));
  }

  async function handleSync() {
    const remote = remotes.find((r) => r.pulp_href === syncRemoteHref);
    if (!remote) {
      setError("Select a remote to sync from.");
      return;
    }
    const rateLimitMinimum = getBaseFieldHint(plugin, "rate_limit").minimum;
    const concurrency = parseIntegerInput(downloadConcurrency, DOWNLOAD_CONCURRENCY_MINIMUM);
    if (!concurrency.ok) {
      setError(numericProblem("Download concurrency", true, DOWNLOAD_CONCURRENCY_MINIMUM));
      return;
    }
    const rate = parseIntegerInput(rateLimit, rateLimitMinimum);
    if (!rate.ok) {
      setError(numericProblem("Rate limit", true, rateLimitMinimum));
      return;
    }
    // Only the fields that changed are sent, so the PATCH cannot touch secrets, headers or anything else.
    const changes: { download_concurrency?: number | null; rate_limit?: number | null } = {};
    if (concurrency.value !== remote.download_concurrency) {
      changes.download_concurrency = concurrency.value;
    }
    if (rate.value !== (remote.rate_limit ?? null)) {
      changes.rate_limit = rate.value;
    }
    onBusyChange(true);
    setIsSyncing(true);
    setError(null);
    let remoteUpdated = false;
    try {
      if (Object.keys(changes).length > 0) {
        const updated = await pulpRemoteService.update(kind, remote.pulp_href, changes);
        if (!updated.ok) {
          throw new Error(`The remote was not updated and no sync was started: ${updated.detail}`);
        }
        remoteUpdated = true;
        setRemotes((prev) =>
          prev.map((r) => (r.pulp_href === remote.pulp_href ? { ...r, ...changes } : r))
        );
      }
      const result = await pulpRepositoryManagementService.sync(kind, {
        pulp_href: repo.pulp_href,
        remote: syncRemoteHref,
        fields: syncFieldValues,
      });
      if (!result.ok) {
        throw new Error(result.detail);
      }
      onSynced({ repoName: repo.name, task: result.data.task });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to start sync.";
      setError(
        remoteUpdated
          ? `The remote "${remote.name}" was updated, but the sync did not start: ${message}`
          : message
      );
    } finally {
      onBusyChange(false);
      setIsSyncing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/50 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Sync ${repo.name}`}
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Sync repository
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">
            {repo.name}
          </span>
          <span className="mt-1 block break-all font-mono text-xs text-zinc-500">
            {repo.pulp_href}
          </span>
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <FormField label="Remote">
            <select
              value={syncRemoteHref}
              onChange={(e) => selectRemote(e.target.value)}
              disabled={isSyncing || isLoadingRemotes}
              className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            >
              <option value="">
                {isLoadingRemotes
                  ? "Loading remotes…"
                  : remotes.length === 0
                    ? `No ${kind.toUpperCase()} remotes found`
                    : "Select a remote…"}
              </option>
              {remotes.map((remote) => (
                <option key={remote.pulp_href} value={remote.pulp_href}>
                  {remote.name} — {remote.url}
                </option>
              ))}
            </select>
            {!isLoadingRemotes && remotes.length === 0 ? (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Create one first on the{" "}
                <Link href="/remotes/list" className="underline underline-offset-2">
                  Remotes
                </Link>{" "}
                page.
              </span>
            ) : null}
          </FormField>
          {getPlugin(kind).syncFields.map((field) => {
            const value = syncFieldValues[field.name];
            const options = field.options ?? [];
            if (field.type === "boolean") {
              return (
                <label
                  key={field.name}
                  className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0"
                    checked={Boolean(value)}
                    disabled={isSyncing}
                    onChange={(e) =>
                      setSyncFieldValues((prev) => ({ ...prev, [field.name]: e.target.checked }))
                    }
                  />
                  {field.label}
                </label>
              );
            }
            if (field.type === "enum") {
              return (
                <FormField key={field.name} label={field.label}>
                  <select
                    value={typeof value === "string" ? value : ""}
                    onChange={(e) =>
                      setSyncFieldValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                    }
                    disabled={isSyncing}
                    className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                  >
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {field.optionLabels?.[option] ?? option}
                      </option>
                    ))}
                  </select>
                </FormField>
              );
            }
            const selected = Array.isArray(value) ? value : [];
            return (
              <FormField key={field.name} label={field.label}>
                <select
                  multiple
                  value={selected}
                  onChange={(event) => {
                    const values = Array.from(
                      event.target.selectedOptions,
                      (option) => option.value
                    );
                    setSyncFieldValues((prev) => ({ ...prev, [field.name]: values }));
                  }}
                  disabled={isSyncing}
                  className={selectClassName}
                  size={Math.min(options.length, 6)}
                >
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FormField>
            );
          })}
          <AdvancedSection>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              These are settings of the remote, not of this sync. Changing either updates the
              remote for every future sync that uses it. They do not control how many syncs run
              at once.
            </p>
            <FormField label="Download concurrency (optional)">
              <Input
                value={downloadConcurrency}
                onChange={(event) => setDownloadConcurrency(event.target.value)}
                disabled={isSyncing || !syncRemoteHref}
                inputMode="numeric"
                placeholder={getBaseFieldHint(plugin, "download_concurrency").placeholder}
              />
            </FormField>
            <FormField label="Rate limit (optional)">
              <Input
                value={rateLimit}
                onChange={(event) => setRateLimit(event.target.value)}
                disabled={isSyncing || !syncRemoteHref}
                inputMode="numeric"
                placeholder={getBaseFieldHint(plugin, "rate_limit").placeholder}
              />
            </FormField>
          </AdvancedSection>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={isSyncing} onClick={close}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isSyncing || isLoadingRemotes || !syncRemoteHref}
            onClick={() => void handleSync()}
          >
            {isSyncing ? "Starting…" : "Start sync"}
          </Button>
        </div>
      </div>
    </div>
  );
}
