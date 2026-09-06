"use client";

import Link from "next/link";
import { FormEvent, useEffect, useId, useState } from "react";
import { usePulpAuthContext } from "./auth-context";
import { usePulpPluginsContext } from "./plugins-context";
import { Button } from "@/components/ui/button";
import { CircleHelp } from "lucide-react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { type PulpPluginKind } from "@/lib/pulp-plugins";
import { pulpRemoteService } from "@/services/pulp/remote-service";
import {
  pulpRepositoryManagementService,
  type RepositoryCreateResult,
} from "@/services/pulp/repository-management-service";
import { PulpRemote, type RepositoryCreatePayload } from "@/services/pulp/types";

const repoCreateTextareaClass =
  "min-h-[4rem] w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export type RepositoryCreateModalProps = {
  initialKind: PulpPluginKind;
  onClose: () => void;
  onCreated: () => void;
  onBusyChange: (busy: boolean) => void;
};

export function RepositoryCreateModal({
  initialKind,
  onClose,
  onCreated,
  onBusyChange,
}: RepositoryCreateModalProps) {
  const { setError } = usePulpAuthContext();
  const { plugins, getPlugin } = usePulpPluginsContext();
  const titleId = useId();

  const [createKind, setCreateKind] = useState<PulpPluginKind>(initialKind);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createRemote, setCreateRemote] = useState("");
  const [createAutopublish, setCreateAutopublish] = useState(false);
  const [createManifest, setCreateManifest] = useState("");
  const [createNamingHintOpen, setCreateNamingHintOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createResult, setCreateResult] = useState<RepositoryCreateResult | null>(null);
  // Filled in per kind as remotes load. The registry is derived from the server, so a kind
  // this map has not reached yet reads as an empty list rather than undefined.
  const [remotesByKind, setRemotesByKind] = useState<Record<PulpPluginKind, PulpRemote[]>>({});

  function resetCreateRepositoryFields() {
    setCreateDescription("");
    setCreateRemote("");
    setCreateAutopublish(false);
    setCreateManifest("");
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const lists = await Promise.all(
          plugins.map(
            async (plugin) => [plugin.kind, (await pulpRemoteService.list(plugin.kind)).results] as const
          )
        );
        if (active) {
          setRemotesByKind(Object.fromEntries(lists) as Record<PulpPluginKind, PulpRemote[]>);
        }
      } catch {
        // Leave remotes empty; the (none) option still works.
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
      if (event.key === "Escape" && !isCreating) {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isCreating, onClose]);

  function close() {
    if (isCreating) return;
    onClose();
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = createName.trim();
    if (!trimmed) {
      setError("Repository name is required.");
      return;
    }
    onBusyChange(true);
    setError(null);
    setIsCreating(true);
    setCreateResult(null);
    try {
      const extraRepoFields = getPlugin(createKind).extraRepoFields;
      const payload: RepositoryCreatePayload = {
        pulp_labels: {},
        name: trimmed,
        description: createDescription,
        retain_repo_versions: null,
        remote: createRemote.trim() === "" ? null : createRemote.trim(),
      };
      if (extraRepoFields.includes("autopublish")) {
        payload.autopublish = createAutopublish;
      }
      if (extraRepoFields.includes("manifest")) {
        payload.manifest = createManifest.trim() === "" ? null : createManifest.trim();
      }

      const result = await pulpRepositoryManagementService.create(createKind, payload);
      if (!result.ok) {
        throw new Error(result.detail);
      }
      setCreateResult(result.data);
      setCreateName("");
      resetCreateRepositoryFields();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed.");
    } finally {
      onBusyChange(false);
      setIsCreating(false);
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
        aria-labelledby={titleId}
        className="max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Create repository
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          New RPM, Debian APT, or File repository in Pulp.
        </p>

        <div className="mt-4">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-amber-900 underline decoration-amber-400/70 underline-offset-2 hover:decoration-amber-600 disabled:opacity-50 dark:text-amber-200 dark:decoration-amber-600/60 dark:hover:decoration-amber-400"
            aria-expanded={createNamingHintOpen}
            aria-controls={`${titleId}-naming-hint`}
            disabled={isCreating}
            onClick={() => setCreateNamingHintOpen((open) => !open)}
          >
            <CircleHelp className="size-4 shrink-0" strokeWidth={2} aria-hidden />
            How to name the repository
          </button>
          <div
            id={`${titleId}-naming-hint`}
            role="region"
            aria-label="Repository naming guidance"
            hidden={!createNamingHintOpen}
            className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/60 p-3 text-sm text-zinc-700 dark:border-amber-900/40 dark:bg-amber-950/25 dark:text-zinc-300"
          >
            <p className="font-medium text-zinc-900 dark:text-zinc-100">How to name the repository</p>
            <p className="mt-2">
              Use a path-style name: product or stream, distro family, major version, then architecture
              (matches how you organize RHEL-style trees).
            </p>
            <p className="mb-1.5 mt-3 font-medium text-zinc-900 dark:text-zinc-100">Examples</p>
            <ul className="space-y-1 rounded-md border border-amber-200/60 bg-white/80 px-3 py-2 font-mono text-xs text-zinc-800 dark:border-amber-900/50 dark:bg-zinc-950/40 dark:text-zinc-200 sm:text-sm">
              <li>yourpulp-devel/rhel/10/noarch</li>
              <li>yourpulp-devel/rhel/10/x86_64</li>
            </ul>
          </div>
        </div>

        <form className="mt-4 flex flex-col gap-4" onSubmit={(e) => void handleCreateSubmit(e)}>
          <FormField label="Type">
            <select
              value={createKind}
              onChange={(event) => setCreateKind(event.target.value as PulpPluginKind)}
              disabled={isCreating}
              className={selectClassName}
            >
              {plugins.map((plugin) => (
                <option key={plugin.kind} value={plugin.kind}>
                  {plugin.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Name">
            <Input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              required
              disabled={isCreating}
            />
          </FormField>
          <div className="space-y-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <FormField label="Description">
              <textarea
                className={repoCreateTextareaClass}
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                disabled={isCreating}
                rows={2}
                placeholder="Optional"
              />
            </FormField>
            <FormField label="Remote">
              <select
                value={createRemote}
                onChange={(e) => setCreateRemote(e.target.value)}
                disabled={isCreating}
                className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              >
                <option value="">(none)</option>
                {createRemote !== "" &&
                !(remotesByKind[createKind] ?? []).some((r) => r.pulp_href === createRemote) ? (
                  <option value={createRemote}>{createRemote} (current)</option>
                ) : null}
                {(remotesByKind[createKind] ?? []).map((remote) => (
                  <option key={remote.pulp_href} value={remote.pulp_href}>
                    {remote.name} — {remote.url}
                  </option>
                ))}
              </select>
            </FormField>
            {createKind === "rpm" || createKind === "file" ? (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 rounded border-zinc-300 dark:border-zinc-600"
                  checked={createAutopublish}
                  disabled={isCreating}
                  onChange={(e) => setCreateAutopublish(e.target.checked)}
                />
                Autopublish new repository versions after sync
              </label>
            ) : null}
            {createKind === "file" ? (
              <FormField label="Manifest filename">
                <Input
                  value={createManifest}
                  onChange={(e) => setCreateManifest(e.target.value)}
                  disabled={isCreating}
                  placeholder="Optional — defaults to PULP_MANIFEST"
                />
              </FormField>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isCreating}>
              {isCreating ? "Creating…" : "Create"}
            </Button>
            <Button type="button" variant="outline" disabled={isCreating} onClick={close}>
              Cancel
            </Button>
          </div>
        </form>

        {createResult ? (
          <div className="mt-4 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <p className="font-medium text-zinc-900 dark:text-zinc-50">Created</p>
            <p className="mt-2">
              <span className="font-medium">Name:</span> {createResult.name}
            </p>
            <p className="mt-1 break-all">
              <span className="font-medium">Href:</span> {createResult.pulp_href ?? "—"}
            </p>
            <p className="mt-1 break-all">
              <span className="font-medium">Task:</span>{" "}
              {createResult.task ? (
                <Link
                  href={`/tasks/detail?pulp_href=${encodeURIComponent(createResult.task)}`}
                  className="underline underline-offset-2"
                >
                  {createResult.task}
                </Link>
              ) : (
                "—"
              )}
            </p>
            {createResult.pulp_href ? (
              <Link
                href={`/repositories/content?pulp_href=${encodeURIComponent(createResult.pulp_href)}`}
                className="mt-3 inline-flex rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                View content
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
