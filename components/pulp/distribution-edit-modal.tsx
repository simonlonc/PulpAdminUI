"use client";

import { useEffect, useId, useState } from "react";
import { AdvancedSection } from "@/components/ui/advanced-section";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { usePulpRepositoryOptions } from "./use-pulp-repository-options";
import { usePulpPublicationOptions } from "./use-pulp-publication-options";
import { usePulpPluginsContext } from "./plugins-context";
import { DistributionVersionFields, repositoryHrefOfVersion } from "./distribution-version-fields";
import { pulpContentGuardService } from "@/services/pulp/content-guard-service";
import { pulpDistributionService } from "@/services/pulp/distribution-service";
import { getBaseFieldHint, supportsRepositoryVersionBinding } from "@/lib/pulp-plugins";
import { PulpContentGuard, PulpDistribution } from "@/services/pulp/types";

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

type Binding = "none" | "repository" | "publication" | "repository_version";

export type DistributionEditModalProps = {
  distribution: PulpDistribution;
  onClose: () => void;
  onSaved: () => void;
};

export function DistributionEditModal({
  distribution,
  onClose,
  onSaved,
}: DistributionEditModalProps) {
  const { repositoryOptions } = usePulpRepositoryOptions(true);
  const { publicationOptions } = usePulpPublicationOptions(true);
  const { plugins, getPlugin } = usePulpPluginsContext();
  const [contentGuards, setContentGuards] = useState<PulpContentGuard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const titleId = useId();

  const [name, setName] = useState(distribution.name);
  const [basePath, setBasePath] = useState(distribution.base_path);
  const [binding, setBinding] = useState<Binding>("none");
  const [repository, setRepository] = useState("");
  const [publication, setPublication] = useState("");
  const [versionRepository, setVersionRepository] = useState("");
  const [repositoryVersion, setRepositoryVersion] = useState("");
  const [contentGuard, setContentGuard] = useState("");
  const distributionPlugin = plugins.find((p) => distribution.pulp_href.includes(p.distributionPath));
  const hiddenDefault =
    (distributionPlugin ? getBaseFieldHint(distributionPlugin, "hidden").default : undefined) === true;
  const [hidden, setHidden] = useState(hiddenDefault);

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      try {
        const [detail, guards] = await Promise.all([
          pulpDistributionService.get(distribution.pulp_href),
          pulpContentGuardService.list(new URLSearchParams({ limit: "200", offset: "0" })),
        ]);
        if (!active) return;

        if (detail.repository_version) {
          setBinding("repository_version");
          setVersionRepository(repositoryHrefOfVersion(detail.repository_version));
          setRepositoryVersion(detail.repository_version);
        } else if (detail.repository) {
          setBinding("repository");
          setRepository(detail.repository);
        } else if (detail.publication) {
          setBinding("publication");
          setPublication(detail.publication);
        } else {
          setBinding("none");
        }
        setContentGuard(detail.content_guard ?? "");
        setHidden(detail.hidden ?? hiddenDefault);
        setContentGuards(guards.results);
      } catch (error) {
        if (active) {
          setModalError(
            error instanceof Error ? error.message : "Failed to load distribution detail."
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distribution.pulp_href]);

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
    const trimmedBasePath = basePath.trim();
    if (!trimmedName) {
      setModalError("Name is required.");
      return;
    }
    if (!trimmedBasePath) {
      setModalError("Base path is required.");
      return;
    }
    if (binding === "repository" && !repository) {
      setModalError("Select a repository.");
      return;
    }
    if (binding === "publication" && !publication) {
      setModalError("Select a publication.");
      return;
    }
    if (binding === "repository_version" && !repositoryVersion) {
      setModalError("Select a repository version.");
      return;
    }

    setIsSaving(true);
    try {
      const result = await pulpDistributionService.update(distribution.pulp_href, {
        name: trimmedName,
        base_path: trimmedBasePath,
        repository: binding === "repository" ? repository : null,
        publication: binding === "publication" ? publication : null,
        repository_version: binding === "repository_version" ? repositoryVersion : null,
        content_guard: contentGuard || null,
        hidden,
      });
      if (!result.ok) {
        setModalError(result.detail);
        return;
      }
      onSaved();
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
        className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Edit distribution
        </h2>
        <p className="mt-1 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {distribution.pulp_href}
        </p>

        {modalError ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
          >
            {modalError}
          </p>
        ) : null}

        {isLoading ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <FormField label="Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} disabled={isSaving} />
            </FormField>
            <FormField label="Base path">
              <Input
                value={basePath}
                onChange={(event) => setBasePath(event.target.value)}
                disabled={isSaving}
              />
            </FormField>
            <FormField label="Binding">
              <select
                value={binding}
                onChange={(event) => setBinding(event.target.value as Binding)}
                disabled={isSaving}
                className={selectClassName}
              >
                <option value="none">None</option>
                <option value="repository">Repository</option>
                <option value="publication">Publication</option>
              {binding === "repository_version" || supportsRepositoryVersionBinding(distributionPlugin) ? (
                <option value="repository_version">Repository version</option>
              ) : null}
              </select>
            </FormField>
            {binding === "repository" ? (
              <FormField label="Repository">
                <select
                  value={repository}
                  onChange={(event) => setRepository(event.target.value)}
                  disabled={isSaving}
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
            ) : null}
            {binding === "publication" ? (
              <FormField label="Publication">
                <select
                  value={publication}
                  onChange={(event) => setPublication(event.target.value)}
                  disabled={isSaving}
                  className={selectClassName}
                >
                  <option value="">Select a publication</option>
                  {publicationOptions.map((option) => (
                    <option key={option.href} value={option.href}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}
            {binding === "repository_version" ? (
              <DistributionVersionFields
                repositoryOptions={repositoryOptions}
                repository={versionRepository}
                version={repositoryVersion}
                disabled={isSaving}
                onRepositoryChange={(href) => {
                  setVersionRepository(href);
                  setRepositoryVersion("");
                }}
                onVersionChange={setRepositoryVersion}
              />
            ) : null}
            <FormField label="Content guard">
              <select
                value={contentGuard}
                onChange={(event) => setContentGuard(event.target.value)}
                disabled={isSaving}
                className={selectClassName}
              >
                <option value="">None</option>
                {contentGuards.map((guard) => (
                  <option key={guard.pulp_href} value={guard.pulp_href}>
                    {guard.name}
                  </option>
                ))}
              </select>
            </FormField>
            <AdvancedSection setCount={hidden !== hiddenDefault ? 1 : 0}>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hidden}
                  disabled={isSaving}
                  onChange={(event) => setHidden(event.target.checked)}
                />
                Hidden from the content app
              </label>
            </AdvancedSection>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={isSaving} onClick={close}>
            Cancel
          </Button>
          <Button type="button" disabled={isSaving || isLoading} onClick={() => void handleSave()}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
