"use client";

import Link from "next/link";
import { FormEvent, useEffect, useId, useState } from "react";
import { PulpRepositoryOption } from "./use-pulp-repository-options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckboxField, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  ExportChecksumAlgorithm,
  exportChecksumAlgorithm,
  exportFileBasename,
} from "@/lib/pulp-export-manifest";
import { pulpExportService } from "@/services/pulp/export-service";
import { PulpExport } from "@/services/pulp/types";

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

type PublishRow = {
  path: string;
  basename: string;
  checksum: string;
  algorithm: ExportChecksumAlgorithm;
  isToc: boolean;
  checked: boolean;
  fileUrl: string;
};

/** What happened to one file: the dispatched task, or Pulp's own error message. */
type PublishOutcome = { path: string; basename: string; task: string | null; error: string | null };

export type ExportPublishModalProps = {
  exportRow: PulpExport;
  repositoryOptions: PulpRepositoryOption[];
  repositoryOptionsLoading?: boolean;
  onClose: () => void;
};

export function ExportPublishModal({
  exportRow,
  repositoryOptions,
  repositoryOptionsLoading = false,
  onClose,
}: ExportPublishModalProps) {
  const [modalError, setModalError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [rows, setRows] = useState<PublishRow[]>([]);
  const [repository, setRepository] = useState("");
  const [outcomes, setOutcomes] = useState<PublishOutcome[] | null>(null);
  const titleId = useId();

  const errorMessage = modalError ?? loadError;
  const fileRepositories = repositoryOptions.filter((option) => option.kind === "file");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await pulpExportService.getPublishFiles(exportRow.pulp_href);
        if (active) {
          setConfigured(data.configured);
          setRows(
            data.files.map((file) => ({
              path: file.path,
              basename: exportFileBasename(file.path),
              checksum: file.checksum,
              algorithm: exportChecksumAlgorithm(file.checksum),
              isToc: file.path === exportRow.toc_info?.file,
              checked: true,
              fileUrl: file.file_url ?? "",
            }))
          );
        }
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Failed to load the export's files.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [exportRow]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPublishing) {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isPublishing, onClose]);

  function close() {
    if (isPublishing) return;
    onClose();
  }

  function updateRow(path: string, change: Partial<PublishRow>) {
    setRows((current) => current.map((row) => (row.path === path ? { ...row, ...change } : row)));
  }

  async function handlePublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModalError(null);

    const selected = rows.filter((row) => row.checked);
    if (!repository) {
      setModalError("Choose a File repository.");
      return;
    }
    if (selected.length === 0) {
      setModalError("Check at least one file to publish.");
      return;
    }
    if (selected.some((row) => !row.fileUrl.trim())) {
      setModalError("Every checked file needs a file URL.");
      return;
    }

    setIsPublishing(true);
    const results: PublishOutcome[] = [];
    // One at a time, and a failure is recorded instead of thrown, so it cannot hide the other files.
    for (const row of selected) {
      const outcome = { path: row.path, basename: row.basename, task: null, error: null };
      try {
        const result = await pulpExportService.publishFile(exportRow.pulp_href, {
          path: row.path,
          repository,
          file_url: row.fileUrl.trim(),
        });
        results.push(
          result.ok ? { ...outcome, task: result.data.task } : { ...outcome, error: result.detail }
        );
      } catch (error) {
        results.push({
          ...outcome,
          error: error instanceof Error ? error.message : "Failed to publish the file.",
        });
      }
    }
    setOutcomes(results);
    setIsPublishing(false);
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
        className="max-h-[min(90vh,44rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Publish to repository
        </h2>
        <p className="mt-2 break-all font-mono text-xs text-zinc-500">{exportRow.pulp_href}</p>

        {errorMessage ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
          >
            {errorMessage}
          </p>
        ) : null}

        {outcomes ? (
          <>
            <ul aria-label="Publish results" className="mt-4 space-y-2">
              {outcomes.map((outcome) => (
                <li
                  key={outcome.path}
                  className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                >
                  <p className="font-medium">{outcome.basename}</p>
                  {outcome.task ? (
                    <p className="mt-1 break-all font-mono text-xs text-emerald-800 dark:text-emerald-300/80">
                      Task:{" "}
                      <Link
                        href={`/tasks/detail?pulp_href=${encodeURIComponent(outcome.task)}`}
                        className="underline decoration-emerald-400 underline-offset-2"
                      >
                        {outcome.task}
                      </Link>
                    </p>
                  ) : (
                    <p className="mt-1 break-words text-xs text-red-800 dark:text-red-200">
                      {outcome.error}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              A task only starts the download: if the Pulp worker cannot reach a URL, Pulp reports
              that as the task&apos;s failure on its task page.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button type="button" onClick={close}>
                Close
              </Button>
            </div>
          </>
        ) : isLoading ? (
          <p className="mt-4 text-sm text-zinc-500">Loading files…</p>
        ) : loadError ? (
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" onClick={close}>
              Close
            </Button>
          </div>
        ) : (
          <form className="mt-4 flex flex-col gap-3" onSubmit={(event) => void handlePublish(event)}>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Each checked file becomes a file content unit in the repository, under its own file
              name. The URL is downloaded by the Pulp worker, not by this browser or this app, so
              it must be reachable from the Pulp worker. Serving the export directory over HTTP is
              infrastructure outside this app.
            </p>
            {configured ? null : (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                This app does not know where the export directory is served. Set{" "}
                <span className="font-mono">PULP_EXPORT_HTTP_BASE_URL</span> and{" "}
                <span className="font-mono">PULP_EXPORT_HTTP_PATH_PREFIX</span> on this
                app&apos;s server to pre-fill these fields, or enter each URL by hand.
              </p>
            )}

            <FormField label="Repository">
              <select
                value={repository}
                onChange={(event) => setRepository(event.target.value)}
                disabled={isPublishing}
                className={selectClassName}
              >
                <option value="">Select a File repository</option>
                {fileRepositories.map((option) => (
                  <option key={option.href} value={option.href}>
                    {option.name}
                  </option>
                ))}
              </select>
              {fileRepositories.length === 0 ? (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {repositoryOptionsLoading
                    ? "Loading repositories…"
                    : "There are no File repositories yet. Create one on the Repositories page first."}
                </span>
              ) : null}
            </FormField>

            {rows.length === 0 ? (
              <p className="text-sm text-zinc-500">No files recorded for this export.</p>
            ) : (
              <ul aria-label="Files to publish" className="space-y-2">
                {rows.map((row) => (
                  <li
                    key={row.path}
                    className="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
                  >
                    <CheckboxField
                      label={
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{row.basename}</span>
                          {row.isToc ? <Badge variant="outline">TOC</Badge> : null}
                        </span>
                      }
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0"
                        checked={row.checked}
                        disabled={isPublishing}
                        onChange={(event) => updateRow(row.path, { checked: event.target.checked })}
                      />
                    </CheckboxField>
                    <p className="break-all font-mono text-xs">
                      <span className="text-zinc-500">{row.algorithm}</span> {row.checksum}
                    </p>
                    <FormField label="File URL">
                      <Input
                        aria-label={`File URL for ${row.basename}`}
                        value={row.fileUrl}
                        onChange={(event) => updateRow(row.path, { fileUrl: event.target.value })}
                        disabled={isPublishing}
                        placeholder="http://files.example.com/export-....tar"
                        className="font-mono"
                      />
                    </FormField>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              After publishing, compare the content unit&apos;s sha256 with the TOC&apos;s sha256
              shown above. The archive&apos;s crc32 is what the TOC records for it and cannot be
              compared with a sha256.
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={isPublishing} onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPublishing || rows.length === 0}>
                {isPublishing ? "Publishing…" : "Publish"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
