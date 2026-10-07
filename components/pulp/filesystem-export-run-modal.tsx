"use client";

import Link from "next/link";
import { FormEvent, useEffect, useId, useState } from "react";
import { usePulpPublicationOptions } from "./use-pulp-publication-options";
import { usePulpRepositoryOptions } from "./use-pulp-repository-options";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { pulpFilesystemExportService } from "@/services/pulp/filesystem-export-service";
import { PulpFilesystemExporter, RunPulpFilesystemExportPayload } from "@/services/pulp/types";

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

type Source = "publication" | "repository_version";

export type FilesystemExportRunModalProps = {
  exporter: PulpFilesystemExporter;
  /** `dispatched` is true when an export was started from this dialog, so the caller can reload its history. */
  onClose: (dispatched: boolean) => void;
};

export function FilesystemExportRunModal({ exporter, onClose }: FilesystemExportRunModalProps) {
  const { repositoryOptions } = usePulpRepositoryOptions(true);
  const { publicationOptions } = usePulpPublicationOptions(true);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [task, setTask] = useState<string | null>(null);
  const titleId = useId();

  const [source, setSource] = useState<Source>("publication");
  const [publication, setPublication] = useState("");
  const [repository, setRepository] = useState("");

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isRunning) {
        onClose(task !== null);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isRunning, task, onClose]);

  function close() {
    if (isRunning) return;
    onClose(task !== null);
  }

  async function handleRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModalError(null);

    const payload: RunPulpFilesystemExportPayload = {};
    if (source === "publication") {
      if (!publication) {
        setModalError("Select a publication.");
        return;
      }
      payload.publication = publication;
    } else {
      const latestVersionHref = repositoryOptions.find(
        (option) => option.href === repository
      )?.latestVersionHref;
      if (!latestVersionHref) {
        setModalError("Select a repository that has a version.");
        return;
      }
      payload.repository_version = latestVersionHref;
    }

    setIsRunning(true);
    try {
      const result = await pulpFilesystemExportService.runExport(exporter.pulp_href, payload);
      if (!result.ok) {
        throw new Error(result.detail);
      }
      setTask(result.data.task);
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Failed to start export.");
    } finally {
      setIsRunning(false);
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
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Run export
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">{exporter.name}</span>
          <span className="mt-1 block break-all font-mono text-xs text-zinc-500">
            {exporter.path} ({exporter.method})
          </span>
        </p>

        {modalError ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
          >
            {modalError}
          </p>
        ) : null}

        {task ? (
          <>
            <div className="mt-4 rounded-lg border border-emerald-300/80 bg-emerald-50/90 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/35">
              <p className="font-medium text-emerald-900 dark:text-emerald-100">Export dispatched</p>
              <p className="mt-1 text-emerald-800 dark:text-emerald-200/90">
                The export runs in the background; open the task to follow its progress. Closing
                this dialog reloads the exporter&apos;s history, which lists the export once the
                task has created it.
              </p>
              <p className="mt-1 break-all font-mono text-xs text-emerald-800/80 dark:text-emerald-300/70">
                Task:{" "}
                <Link
                  href={`/tasks/detail?pulp_href=${encodeURIComponent(task)}`}
                  className="underline decoration-emerald-400 underline-offset-2"
                >
                  {task}
                </Link>
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button type="button" onClick={close}>
                Close
              </Button>
            </div>
          </>
        ) : (
          <form className="mt-4 flex flex-col gap-3" onSubmit={(event) => void handleRun(event)}>
            <FormField label="Source">
              <select
                value={source}
                onChange={(event) => setSource(event.target.value as Source)}
                disabled={isRunning}
                className={selectClassName}
              >
                <option value="publication">Publication</option>
                <option value="repository_version">Repository version</option>
              </select>
            </FormField>
            {source === "publication" ? (
              <FormField label="Publication">
                <select
                  value={publication}
                  onChange={(event) => setPublication(event.target.value)}
                  disabled={isRunning}
                  className={selectClassName}
                >
                  <option value="">Select a publication</option>
                  {publicationOptions.map((option) => (
                    <option key={option.href} value={option.href}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : (
              <FormField label="Repository">
                <select
                  value={repository}
                  onChange={(event) => setRepository(event.target.value)}
                  disabled={isRunning}
                  className={selectClassName}
                >
                  <option value="">Select a repository</option>
                  {repositoryOptions.map((option) => (
                    <option
                      key={option.href}
                      value={option.href}
                      disabled={option.latestVersionHref === null}
                    >
                      {option.name} ({option.kind.toUpperCase()}
                      {option.latestVersionHref === null ? ", no versions" : ""})
                    </option>
                  ))}
                </select>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Exports the repository&apos;s latest version.
                </span>
              </FormField>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={isRunning} onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={isRunning}>
                {isRunning ? "Starting…" : "Run export"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
