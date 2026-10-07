"use client";

import { PulpRepositoryOption } from "./use-pulp-repository-options";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export type ExporterFieldsProps = {
  name: string;
  onNameChange: (value: string) => void;
  path: string;
  onPathChange: (value: string) => void;
  /** Repository hrefs currently selected. */
  repositories: string[];
  onRepositoriesChange: (value: string[]) => void;
  repositoryOptions: PulpRepositoryOption[];
  /**
   * Hrefs to keep listed even when `repositoryOptions` has no entry for them (not loaded yet, or
   * past the options' page size), so editing never silently drops a repository the exporter holds.
   */
  keepListed?: string[];
  disabled: boolean;
};

/** The name / path / repositories fields shared by the create and edit dialogs of a PulpExporter. */
export function ExporterFields({
  name,
  onNameChange,
  path,
  onPathChange,
  repositories,
  onRepositoriesChange,
  repositoryOptions,
  keepListed = [],
  disabled,
}: ExporterFieldsProps) {
  const unlisted = keepListed.filter(
    (href) => !repositoryOptions.some((repository) => repository.href === href)
  );

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
          Pulp rejects it.
        </span>
      </FormField>
      <FormField label="Repositories">
        <select
          multiple
          value={repositories}
          onChange={(event) =>
            onRepositoriesChange(Array.from(event.target.selectedOptions, (option) => option.value))
          }
          disabled={disabled}
          size={Math.min(6, Math.max(3, repositoryOptions.length + unlisted.length))}
          className={selectClassName}
        >
          {repositoryOptions.map((repository) => (
            <option key={repository.href} value={repository.href}>
              {repository.name} ({repository.kind.toUpperCase()})
            </option>
          ))}
          {unlisted.map((href) => (
            <option key={href} value={href} className="font-mono">
              {href}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Hold Ctrl or Cmd to select several. May be left empty.
        </span>
      </FormField>
    </>
  );
}
