"use client";

import { useEffect, useId, useState } from "react";
import { ImporterMappingFields, MappingRow, parseMappingRows } from "./importer-mapping-fields";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { pulpImportService } from "@/services/pulp/import-service";
import { CreatePulpImporterPayload } from "@/services/pulp/types";

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

    const parsed = parseMappingRows(rows);
    if (!parsed.ok) {
      setModalError(parsed.detail);
      return;
    }
    const repoMapping = parsed.mapping;

    const payload: CreatePulpImporterPayload = { name: trimmedName };
    if (Object.keys(repoMapping).length > 0) {
      payload.repo_mapping = repoMapping;
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
          <ImporterMappingFields
            rows={rows}
            onRowsChange={(next) => {
              setModalError(null);
              setRows(next);
            }}
            disabled={isSaving}
          />
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
