"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { pulpImportService } from "@/services/pulp/import-service";
import { CreatePulpImporterPayload } from "@/services/pulp/types";

type MappingRow = { exportName: string; localName: string };

export type ImporterCreateModalProps = {
  onClose: () => void;
  onCreated: () => void;
};

export function ImporterCreateModal({ onClose, onCreated }: ImporterCreateModalProps) {
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const titleId = useId();

  const [name, setName] = useState("");
  const [rows, setRows] = useState<MappingRow[]>([]);

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

  function updateRow(index: number, patch: Partial<MappingRow>) {
    setModalError(null);
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setModalError(null);
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addRow() {
    setModalError(null);
    setRows((prev) => [...prev, { exportName: "", localName: "" }]);
  }

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

    // A row with both sides blank is ignored; a row with only one side filled is an error.
    const repoMapping = new Map<string, string>();
    for (const [index, row] of rows.entries()) {
      const exportName = row.exportName.trim();
      const localName = row.localName.trim();
      if (!exportName && !localName) {
        continue;
      }
      if (!exportName || !localName) {
        setModalError(`Mapping row ${index + 1} needs a repository on both sides, or clear it.`);
        return;
      }
      if (repoMapping.has(exportName)) {
        setModalError(`Repository "${exportName}" is mapped twice.`);
        return;
      }
      repoMapping.set(exportName, localName);
    }

    const payload: CreatePulpImporterPayload = { name: trimmedName };
    if (repoMapping.size > 0) {
      payload.repo_mapping = Object.fromEntries(repoMapping);
    }

    setIsSaving(true);
    try {
      const result = await pulpImportService.create(payload);
      if (!result.ok) {
        throw new Error(result.detail);
      }
      onCreated();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Failed to create importer.");
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
          New importer
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
          <div className="flex flex-col gap-3">
            <p className="text-sm">Repository mapping (optional)</p>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Without a mapping, Pulp matches repositories by the names in the export. Map a name to
              import a repository under a different one. Every repository named on the right must
              already exist on this Pulp, or Pulp rejects the importer. To change a mapping later,
              delete the importer and create it again.
            </span>
            {rows.map((row, index) => (
              <div key={index} className="flex items-end gap-2">
                <FormField label="Repository in the export" className="flex-1">
                  <Input
                    value={row.exportName}
                    onChange={(event) => updateRow(index, { exportName: event.target.value })}
                    disabled={isSaving}
                    className="font-mono"
                  />
                </FormField>
                <FormField label="Repository on this Pulp" className="flex-1">
                  <Input
                    value={row.localName}
                    onChange={(event) => updateRow(index, { localName: event.target.value })}
                    disabled={isSaving}
                    className="font-mono"
                  />
                </FormField>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSaving}
                  onClick={() => removeRow(index)}
                  aria-label={`Remove mapping ${row.exportName || index + 1}`}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" disabled={isSaving} onClick={addRow} className="self-start">
              Add mapping
            </Button>
          </div>
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
