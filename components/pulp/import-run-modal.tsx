"use client";

import Link from "next/link";
import { FormEvent, useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckboxField, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { pulpImportService } from "@/services/pulp/import-service";
import {
  PulpImportCheckPayload,
  PulpImportCheckResult,
  PulpImportEvaluation,
  PulpImporter,
  RunPulpImportPayload,
  ServiceDataResult,
} from "@/services/pulp/types";

type ImportSource = "toc" | "path";

/** The inputs a check was run for, so a check can only ever vouch for exactly those inputs. */
type CheckedImport = {
  inputs: string;
  result: ServiceDataResult<PulpImportCheckResult>;
};

export type ImportRunModalProps = {
  importer: PulpImporter;
  /** `dispatched` is true when an import was started from this dialog, so the caller can reload its history. */
  onClose: (dispatched: boolean) => void;
};

export function ImportRunModal({ importer, onClose }: ImportRunModalProps) {
  const [modalError, setModalError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [taskGroup, setTaskGroup] = useState<string | null>(null);
  const [checked, setChecked] = useState<CheckedImport | null>(null);
  const titleId = useId();

  const [source, setSource] = useState<ImportSource>("toc");
  const [location, setLocation] = useState("");
  const [createRepositories, setCreateRepositories] = useState(false);

  const trimmedLocation = location.trim();
  const inputs = JSON.stringify([source, trimmedLocation, createRepositories]);
  // Editing an input clears `checked`. The inputs are kept with it as well, so a check that is
  // answered after an edit made while it was in flight still cannot vouch for the new inputs.
  const currentCheck = checked?.inputs === inputs ? checked.result : null;
  const evaluations = currentCheck?.ok
    ? (Object.entries(currentCheck.data) as [string, PulpImportEvaluation][])
    : [];
  const checkPassed =
    evaluations.length > 0 && evaluations.every(([, evaluation]) => evaluation.is_valid);
  const sourceLabel = source === "toc" ? "TOC file path" : "Archive path";

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isRunning) {
        onClose(taskGroup !== null);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isRunning, taskGroup, onClose]);

  function close() {
    if (isRunning) return;
    onClose(taskGroup !== null);
  }

  async function handleCheck() {
    setModalError(null);

    if (!trimmedLocation) {
      setModalError(`${sourceLabel} is required.`);
      return;
    }

    const payload: PulpImportCheckPayload = { [source]: trimmedLocation };
    if (Object.keys(importer.repo_mapping).length > 0) {
      payload.repo_mapping = importer.repo_mapping;
    }

    const checkedInputs = inputs;
    setIsChecking(true);
    try {
      let result: ServiceDataResult<PulpImportCheckResult>;
      try {
        result = await pulpImportService.checkImport(payload);
      } catch (error) {
        result = {
          ok: false,
          detail: error instanceof Error ? error.message : "Failed to check the import.",
        };
      }
      setChecked({ inputs: checkedInputs, result });
    } finally {
      setIsChecking(false);
    }
  }

  async function handleRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModalError(null);

    // The Run button is disabled until the check passed; this keeps Enter in a field from bypassing it.
    if (!checkPassed) {
      return;
    }

    const payload: RunPulpImportPayload = {
      [source]: trimmedLocation,
      create_repositories: createRepositories,
    };

    setIsRunning(true);
    try {
      const result = await pulpImportService.runImport(importer.pulp_href, payload);
      if (!result.ok) {
        throw new Error(result.detail);
      }
      setTaskGroup(result.data.task_group);
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Failed to start import.");
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
        className="max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Run import
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">{importer.name}</span>
        </p>

        {modalError ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
          >
            {modalError}
          </p>
        ) : null}

        {taskGroup ? (
          <>
            <div className="mt-4 rounded-lg border border-emerald-300/80 bg-emerald-50/90 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/35">
              <p className="font-medium text-emerald-900 dark:text-emerald-100">Import dispatched</p>
              <p className="mt-1 text-emerald-800 dark:text-emerald-200/90">
                The import runs in the background, one task per repository; open the task group to
                follow its progress. The importer&apos;s Imports page lists the import once its task
                has been created.
              </p>
              <p className="mt-1 break-all font-mono text-xs text-emerald-800/80 dark:text-emerald-300/70">
                Task group:{" "}
                <Link
                  href={`/task-groups/detail?pulp_href=${encodeURIComponent(taskGroup)}`}
                  className="underline decoration-emerald-400 underline-offset-2"
                >
                  {taskGroup}
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
            <fieldset className="flex flex-col gap-2 text-sm">
              <legend className="mb-2">Source</legend>
              <CheckboxField label="TOC file (required for a chunked export)">
                <input
                  type="radio"
                  name="import-source"
                  className="h-4 w-4 shrink-0"
                  checked={source === "toc"}
                  disabled={isRunning}
                  onChange={() => {
                    setChecked(null);
                    setSource("toc");
                  }}
                />
              </CheckboxField>
              <CheckboxField label="Archive file">
                <input
                  type="radio"
                  name="import-source"
                  className="h-4 w-4 shrink-0"
                  checked={source === "path"}
                  disabled={isRunning}
                  onChange={() => {
                    setChecked(null);
                    setSource("path");
                  }}
                />
              </CheckboxField>
            </fieldset>
            <FormField label={sourceLabel}>
              <Input
                value={location}
                onChange={(event) => {
                  setChecked(null);
                  setLocation(event.target.value);
                }}
                disabled={isRunning}
                placeholder={
                  source === "toc"
                    ? "/var/lib/pulp/exports/my-exporter/export-...-toc.json"
                    : "/var/lib/pulp/exports/my-exporter/export-....tar"
                }
                className="font-mono"
              />
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                A path on the Pulp server, not on this app&apos;s host.{" "}
                {source === "toc"
                  ? "It is the table-of-contents file shown in the exporter's file manifest on the exporting side, e.g. /var/lib/pulp/exports/<exporter>/export-...-toc.json. "
                  : "It is the export archive listed in the exporter's file manifest on the exporting side. A chunked export needs its TOC file instead. "}
                It must sit under one of the Pulp server&apos;s{" "}
                <span className="font-mono">ALLOWED_IMPORT_PATHS</span>. That is a Pulp server
                setting this app cannot change; ask whoever runs the server to add the directory if
                Pulp rejects it.
              </span>
            </FormField>
            <CheckboxField label="Create missing repositories (Pulp creates any repository missing from this server instead of failing)">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0"
                checked={createRepositories}
                disabled={isRunning}
                onChange={(event) => {
                  setChecked(null);
                  setCreateRepositories(event.target.checked);
                }}
              />
            </CheckboxField>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isRunning || isChecking}
                onClick={() => void handleCheck()}
              >
                {isChecking ? "Checking…" : "Check"}
              </Button>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Run import stays disabled until the check passes for these exact inputs.
              </span>
            </div>

            {currentCheck && !currentCheck.ok ? (
              <p
                role="alert"
                className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
              >
                {currentCheck.detail}
              </p>
            ) : null}

            {evaluations.length > 0 ? (
              <ul aria-label="Check result" className="space-y-2">
                {evaluations.map(([field, evaluation]) => (
                  <li
                    key={field}
                    className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium">{field}</span>
                      <Badge variant={evaluation.is_valid ? "success" : "destructive"}>
                        {evaluation.is_valid ? "Valid" : "Invalid"}
                      </Badge>
                    </div>
                    <p className="mt-1 break-all font-mono text-xs text-zinc-500">
                      {evaluation.context}
                    </p>
                    {evaluation.messages.length > 0 ? (
                      <ul className="mt-1 list-disc space-y-0.5 pl-5">
                        {evaluation.messages.map((message, index) => (
                          <li key={index}>{message}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={isRunning} onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={!checkPassed || isRunning || isChecking}>
                {isRunning ? "Starting…" : "Run import"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
