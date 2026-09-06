"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePulpAuthContext } from "./auth-context";
import { usePulpPluginsContext } from "./plugins-context";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { type PulpPluginKind, type PulpSyncField } from "@/lib/pulp-plugins";
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
  const [isSyncing, setIsSyncing] = useState(false);

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

  async function handleSync() {
    if (!syncRemoteHref) {
      setError("Select a remote to sync from.");
      return;
    }
    onBusyChange(true);
    setIsSyncing(true);
    setError(null);
    try {
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
      setError(e instanceof Error ? e.message : "Failed to start sync.");
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
              onChange={(e) => setSyncRemoteHref(e.target.value)}
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
