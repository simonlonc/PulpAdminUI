"use client";

import { useEffect, useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { pulpRepositoryManagementService } from "@/services/pulp/repository-management-service";
import type { PulpRepositoryVersion } from "@/services/pulp/types";
import type { PulpRepositoryOption } from "./use-pulp-repository-options";
import { usePulpPluginsContext } from "./plugins-context";

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

/** The repository href a repository version href belongs to (the href up to /versions/{n}/). */
export function repositoryHrefOfVersion(versionHref: string): string {
  return versionHref.replace(/versions\/\d+\/?$/, "");
}

/**
 * The two pickers of the "Repository version" binding: a repository, then one of its versions,
 * newest first. Versions load from the repository's versions list when a repository is chosen.
 */
export function DistributionVersionFields({
  repositoryOptions,
  repository,
  version,
  disabled,
  onRepositoryChange,
  onVersionChange,
}: {
  repositoryOptions: PulpRepositoryOption[];
  repository: string;
  version: string;
  disabled: boolean;
  onRepositoryChange: (href: string) => void;
  onVersionChange: (href: string) => void;
}) {
  const { getPlugin } = usePulpPluginsContext();
  const [versions, setVersions] = useState<PulpRepositoryVersion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const kind = repositoryOptions.find((option) => option.href === repository)?.kind;

  useEffect(() => {
    let active = true;

    async function load() {
      if (!repository || !kind) {
        setVersions([]);
        return;
      }
      try {
        const result = await pulpRepositoryManagementService.listRepositoryVersions(kind, repository);
        if (!active) return;
        setError(null);
        setVersions([...result.results].sort((a, b) => b.number - a.number));
      } catch (loadError) {
        if (active) {
          setVersions([]);
          setError(loadError instanceof Error ? loadError.message : "Failed to load versions.");
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [repository, kind]);

  return (
    <>
      <FormField label="Repository">
        <select
          value={repository}
          onChange={(event) => onRepositoryChange(event.target.value)}
          disabled={disabled}
          className={selectClassName}
        >
          <option value="">Select a repository</option>
          {repositoryOptions.map((option) => (
            <option key={option.href} value={option.href}>
              {option.name} ({getPlugin(option.kind).label})
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Repository version">
        <select
          value={version}
          onChange={(event) => onVersionChange(event.target.value)}
          disabled={disabled || !repository}
          className={selectClassName}
        >
          <option value="">Select a version</option>
          {versions.map((entry) => (
            <option key={entry.pulp_href} value={entry.pulp_href}>
              Version {entry.number} ({entry.pulp_created})
            </option>
          ))}
        </select>
      </FormField>
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        This pins the distribution to one fixed version. It will not follow new versions of the
        repository.
      </p>
    </>
  );
}
