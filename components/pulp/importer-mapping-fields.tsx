"use client";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

export type MappingRow = { exportName: string; localName: string };

/** One editable row per `repo_mapping` entry, in the object's order. */
export function mappingRowsFromObject(mapping: Record<string, string>): MappingRow[] {
  return Object.entries(mapping).map(([exportName, localName]) => ({ exportName, localName }));
}

/**
 * Turns the key/value rows into a `repo_mapping` object, trimmed. A row with both sides blank is
 * ignored; a row with only one side filled, or an export name used twice, is an error.
 */
export function parseMappingRows(
  rows: MappingRow[]
): { ok: true; mapping: Record<string, string> } | { ok: false; detail: string } {
  const repoMapping = new Map<string, string>();
  for (const [index, row] of rows.entries()) {
    const exportName = row.exportName.trim();
    const localName = row.localName.trim();
    if (!exportName && !localName) {
      continue;
    }
    if (!exportName || !localName) {
      return { ok: false, detail: `Mapping row ${index + 1} needs a repository on both sides, or clear it.` };
    }
    if (repoMapping.has(exportName)) {
      return { ok: false, detail: `Repository "${exportName}" is mapped twice.` };
    }
    repoMapping.set(exportName, localName);
  }
  return { ok: true, mapping: Object.fromEntries(repoMapping) };
}

export type ImporterMappingFieldsProps = {
  rows: MappingRow[];
  onRowsChange: (rows: MappingRow[]) => void;
  disabled: boolean;
};

/** The repository-mapping rows shared by the create and edit dialogs of a PulpImporter. */
export function ImporterMappingFields({ rows, onRowsChange, disabled }: ImporterMappingFieldsProps) {
  function updateRow(index: number, patch: Partial<MappingRow>) {
    onRowsChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">Repository mapping (optional)</p>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">
        Without a mapping, Pulp matches repositories by the names in the export. Map a name to import
        a repository under a different one. Every repository named on the right must already exist
        on this Pulp, or Pulp rejects the importer.
      </span>
      {rows.map((row, index) => (
        <div key={index} className="flex items-end gap-2">
          <FormField label="Repository in the export" className="min-w-0 flex-1">
            <Input
              value={row.exportName}
              onChange={(event) => updateRow(index, { exportName: event.target.value })}
              disabled={disabled}
              className="font-mono"
            />
          </FormField>
          <FormField label="Repository on this Pulp" className="min-w-0 flex-1">
            <Input
              value={row.localName}
              onChange={(event) => updateRow(index, { localName: event.target.value })}
              disabled={disabled}
              className="font-mono"
            />
          </FormField>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onRowsChange(rows.filter((_, i) => i !== index))}
            aria-label={`Remove mapping ${row.exportName || index + 1}`}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => onRowsChange([...rows, { exportName: "", localName: "" }])}
        className="self-start"
      >
        Add mapping
      </Button>
    </div>
  );
}
