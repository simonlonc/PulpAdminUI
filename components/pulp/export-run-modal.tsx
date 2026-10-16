"use client";

import Link from "next/link";
import { FormEvent, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { pulpExportService } from "@/services/pulp/export-service";
import { PulpExporter, RunPulpExportPayload } from "@/services/pulp/types";

export type ExportRunModalProps = {
  exporter: PulpExporter;
  /** `dispatched` is true when an export was started from this dialog, so the caller can reload its history. */
  onClose: (dispatched: boolean) => void;
};

export function ExportRunModal({ exporter, onClose }: ExportRunModalProps) {
  const [modalError, setModalError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [task, setTask] = useState<string | null>(null);
  const titleId = useId();

  const [full, setFull] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [chunkSize, setChunkSize] = useState("");

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

    const payload: RunPulpExportPayload = { full, dry_run: dryRun };
    const trimmedChunkSize = chunkSize.trim();
    if (trimmedChunkSize) {
      payload.chunk_size = trimmedChunkSize;
    }

    setIsRunning(true);
    try {
      const result = await pulpExportService.runExport(exporter.pulp_href, payload);
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/50 p-4 max-sm:p-0 sm:items-center"
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
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 max-sm:max-h-[92dvh] max-sm:max-w-none max-sm:overflow-y-auto max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Run export
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">{exporter.name}</span>
          <span className="mt-1 block break-all font-mono text-xs text-zinc-500">
            {exporter.path}
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
                The export runs in the background; open the task to follow its progress. The
                exporter&apos;s Exports page lists the export once the task has created it.
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
            <CheckboxField label="Full export (unchecked makes it an incremental export)">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0"
                checked={full}
                disabled={isRunning}
                onChange={(event) => setFull(event.target.checked)}
              />
            </CheckboxField>
            <CheckboxField label="Dry run (report what would be exported and the disk space required)">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0"
                checked={dryRun}
                disabled={isRunning}
                onChange={(event) => setDryRun(event.target.checked)}
              />
            </CheckboxField>
            <FormField label="Chunk size (optional)">
              <Input
                value={chunkSize}
                onChange={(event) => setChunkSize(event.target.value)}
                disabled={isRunning}
                placeholder="500MB"
              />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Splits the export file into pieces of at most this size. Units are B, KB, MB, GB or
                TB, and a piece can be at most 1TB. Leave blank to write a single file.
              </span>
            </FormField>
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
