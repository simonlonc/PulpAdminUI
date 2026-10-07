"use client";

import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PULP_FILESYSTEM_EXPORT_METHODS } from "@/services/pulp/filesystem-export-methods";
import { PulpFilesystemExportMethod } from "@/services/pulp/types";

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export type FilesystemExporterFieldsProps = {
  name: string;
  onNameChange: (value: string) => void;
  path: string;
  onPathChange: (value: string) => void;
  method: PulpFilesystemExportMethod;
  onMethodChange: (value: PulpFilesystemExportMethod) => void;
  disabled: boolean;
};

/** The name / path / method fields shared by the create and edit dialogs of a FilesystemExporter. */
export function FilesystemExporterFields({
  name,
  onNameChange,
  path,
  onPathChange,
  method,
  onMethodChange,
  disabled,
}: FilesystemExporterFieldsProps) {
  return (
    <>
      <FormField label="Name">
        <Input value={name} onChange={(event) => onNameChange(event.target.value)} disabled={disabled} />
      </FormField>
      <FormField label="Path">
        <Input
          value={path}
          onChange={(event) => onPathChange(event.target.value)}
          disabled={disabled}
          placeholder="/var/lib/pulp/exports/my-exporter"
          className="font-mono"
        />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          A directory on the Pulp server, not on this app&apos;s host. It must sit under one of the
          Pulp server&apos;s <span className="font-mono">ALLOWED_EXPORT_PATHS</span>. That is a Pulp
          server setting this app cannot change; ask whoever runs the server to add the directory if
          Pulp rejects it. Pulp only writes into an empty directory, so a second export into the
          same path fails until it has been emptied.
        </span>
      </FormField>
      <FormField label="Method">
        <select
          value={method}
          onChange={(event) => onMethodChange(event.target.value as PulpFilesystemExportMethod)}
          disabled={disabled}
          className={selectClassName}
        >
          {PULP_FILESYSTEM_EXPORT_METHODS.map((descriptor) => (
            <option key={descriptor.method} value={descriptor.method}>
              {descriptor.method}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {PULP_FILESYSTEM_EXPORT_METHODS.find((descriptor) => descriptor.method === method)?.hint}
        </span>
      </FormField>
    </>
  );
}
