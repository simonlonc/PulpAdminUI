"use client";

import { useEffect, useId, useState } from "react";
import { PulpRepositoryOption } from "./use-pulp-repository-options";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { pulpExportService } from "@/services/pulp/export-service";

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export type ExporterCreateModalProps = {
  repositoryOptions: PulpRepositoryOption[];
  onClose: () => void;
  onCreated: () => void;
};

export function ExporterCreateModal({
  repositoryOptions,
  onClose,
  onCreated,
}: ExporterCreateModalProps) {
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const titleId = useId();

  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [repositories, setRepositories] = useState<string[]>([]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isSaving, onClose]);

  function close() {
    if (isSaving) return;
    onClose();
  }

  async function handleCreate() {
    setModalError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setModalError("Name is required.");
      return;
    }
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      setModalError("Path is required.");
      return;
    }

    setIsSaving(true);
    try {
      const result = await pulpExportService.create({
        name: trimmedName,
        path: trimmedPath,
        repositories,
      });
      if (!result.ok) {
        throw new Error(result.detail);
      }
      onCreated();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Failed to create exporter.");
    } finally {
      setIsSaving(false);
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
          New exporter
        </h2>

        {modalError ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
          >
            {modalError}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-3">
          <FormField label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} disabled={isSaving} />
          </FormField>
          <FormField label="Path">
            <Input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              disabled={isSaving}
              placeholder="/var/lib/pulp/exports/my-exporter"
              className="font-mono"
            />
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              A directory on the Pulp server, not on this app&apos;s host. It must sit under one of
              the Pulp server&apos;s <span className="font-mono">ALLOWED_EXPORT_PATHS</span>. That
              is a Pulp server setting this app cannot change; ask whoever runs the server to add
              the directory if Pulp rejects it.
            </span>
          </FormField>
          <FormField label="Repositories">
            <select
              multiple
              value={repositories}
              onChange={(event) =>
                setRepositories(Array.from(event.target.selectedOptions, (option) => option.value))
              }
              disabled={isSaving}
              size={Math.min(6, Math.max(3, repositoryOptions.length))}
              className={selectClassName}
            >
              {repositoryOptions.map((repository) => (
                <option key={repository.href} value={repository.href}>
                  {repository.name} ({repository.kind.toUpperCase()})
                </option>
              ))}
            </select>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Hold Ctrl or Cmd to select several. May be left empty.
            </span>
          </FormField>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={isSaving} onClick={close}>
            Cancel
          </Button>
          <Button type="button" disabled={isSaving} onClick={() => void handleCreate()}>
            {isSaving ? "Creating…" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}
