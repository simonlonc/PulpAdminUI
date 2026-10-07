"use client";

import { useEffect, useId, useState } from "react";
import {
  ImporterMappingFields,
  mappingRowsFromObject,
  MappingRow,
  parseMappingRows,
} from "./importer-mapping-fields";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { pulpImportService } from "@/services/pulp/import-service";
import { pulpSearchService } from "@/services/pulp/search-service";
import { PulpImporter, UpdatePulpImporterPayload } from "@/services/pulp/types";

/** The most hits the search route returns per family. */
const SEARCH_LIMIT = 100;

function sameMapping(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => b[key] === a[key]);
}

function quoteList(names: string[]): string {
  return names.map((name) => `"${name}"`).join(", ");
}

/**
 * Pulp answers a PATCH that maps to a repository which does not exist with a 500 and clears the
 * importer's stored mapping, so every destination is looked up first. The repository options the
 * create dialogs use are per plugin and page-limited, so this asks the search route for the exact
 * name instead. Returns the message to show when the PATCH must not be sent, or null when it may.
 */
async function findUnsafeDestinations(names: string[]): Promise<string | null> {
  const missing: string[] = [];
  const unverified: string[] = [];

  const groups = await Promise.all(names.map((name) => pulpSearchService.search(name, SEARCH_LIMIT)));
  names.forEach((name, index) => {
    const group = groups[index].find((candidate) => candidate.family === "repository");
    if (group && !group.error && group.results.some((hit) => hit.name === name)) {
      return;
    }
    // Not seen. That only proves it is missing when the lookup worked and returned every match.
    if (!group || group.error || group.count > group.results.length) {
      unverified.push(name);
    } else {
      missing.push(name);
    }
  });

  if (missing.length > 0) {
    return `${missing.length === 1 ? "Repository" : "Repositories"} ${quoteList(missing)} ${
      missing.length === 1 ? "does" : "do"
    } not exist on this Pulp. Nothing was saved, because Pulp would clear the importer's stored mapping.`;
  }
  if (unverified.length > 0) {
    return `Could not confirm that ${quoteList(unverified)} ${
      unverified.length === 1 ? "exists" : "exist"
    } on this Pulp. Nothing was saved, because Pulp would clear the importer's stored mapping if it does not.`;
  }
  return null;
}

export type ImporterEditModalProps = {
  importer: PulpImporter;
  onClose: () => void;
  onSaved: () => void;
};

export function ImporterEditModal({ importer, onClose, onSaved }: ImporterEditModalProps) {
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const titleId = useId();

  const [name, setName] = useState(importer.name);
  const [rows, setRows] = useState<MappingRow[]>(() => mappingRowsFromObject(importer.repo_mapping));

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

    const parsed = parseMappingRows(rows);
    if (!parsed.ok) {
      setModalError(parsed.detail);
      return;
    }

    const payload: UpdatePulpImporterPayload = {};
    if (trimmedName !== importer.name) {
      payload.name = trimmedName;
    }
    if (!sameMapping(parsed.mapping, importer.repo_mapping)) {
      payload.repo_mapping = parsed.mapping;
    }
    if (Object.keys(payload).length === 0) {
      setModalError("Nothing has changed.");
      return;
    }

    setIsSaving(true);
    try {
      if (payload.repo_mapping) {
        const destinations = [...new Set(Object.values(payload.repo_mapping))];
        const unsafe = await findUnsafeDestinations(destinations);
        if (unsafe) {
          setModalError(unsafe);
          return;
        }
      }

      const result = await pulpImportService.update(importer.pulp_href, payload);
      if (!result.ok) {
        throw new Error(result.detail);
      }
      onSaved();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Failed to update importer.");
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
          Edit importer
        </h2>
        <p className="mt-1 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {importer.pulp_href}
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
          <Button type="button" disabled={isSaving} onClick={() => void handleSave()}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
