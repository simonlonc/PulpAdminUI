"use client";

import { useEffect, useId, useState } from "react";
import { FilesystemExporterFields } from "./filesystem-exporter-fields";
import { Button } from "@/components/ui/button";
import { pulpFilesystemExportService } from "@/services/pulp/filesystem-export-service";
import {
  PulpFilesystemExporter,
  PulpFilesystemExportMethod,
  UpdatePulpFilesystemExporterPayload,
} from "@/services/pulp/types";

export type FilesystemExporterEditModalProps = {
  exporter: PulpFilesystemExporter;
  onClose: () => void;
  onSaved: () => void;
};

export function FilesystemExporterEditModal({
  exporter,
  onClose,
  onSaved,
}: FilesystemExporterEditModalProps) {
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const titleId = useId();

  const [name, setName] = useState(exporter.name);
  const [path, setPath] = useState(exporter.path);
  const [method, setMethod] = useState<PulpFilesystemExportMethod>(exporter.method);

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

  async function handleSave() {
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

    const payload: UpdatePulpFilesystemExporterPayload = {};
    if (trimmedName !== exporter.name) {
      payload.name = trimmedName;
    }
    if (trimmedPath !== exporter.path) {
      payload.path = trimmedPath;
    }
    if (method !== exporter.method) {
      payload.method = method;
    }
    if (Object.keys(payload).length === 0) {
      setModalError("Nothing has changed.");
      return;
    }

    setIsSaving(true);
    try {
      const result = await pulpFilesystemExportService.update(exporter.pulp_href, payload);
      if (!result.ok) {
        throw new Error(result.detail);
      }
      onSaved();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Failed to update filesystem exporter.");
    } finally {
      setIsSaving(false);
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
        className="max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 max-sm:max-h-[92dvh] max-sm:max-w-none max-sm:overflow-y-auto max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Edit filesystem exporter
        </h2>
        <p className="mt-1 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {exporter.pulp_href}
        </p>

        {modalError ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
          >
            {modalError}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-3">
          <FilesystemExporterFields
            name={name}
            onNameChange={setName}
            path={path}
            onPathChange={setPath}
            method={method}
            onMethodChange={setMethod}
            disabled={isSaving}
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={isSaving} onClick={close}>
            Cancel
          </Button>
          <Button type="button" disabled={isSaving} onClick={() => void handleSave()}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
