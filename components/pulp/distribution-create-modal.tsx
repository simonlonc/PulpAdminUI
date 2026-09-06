"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { usePulpRepositoryOptions } from "./use-pulp-repository-options";
import { usePulpPublicationOptions } from "./use-pulp-publication-options";
import { usePulpPluginsContext } from "./plugins-context";
import { pulpContentGuardService } from "@/services/pulp/content-guard-service";
import { pulpDistributionService } from "@/services/pulp/distribution-service";
import { type PulpPluginKind } from "@/lib/pulp-plugins";
import { PulpContentGuard } from "@/services/pulp/types";

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

type Binding = "none" | "repository" | "publication";

export type DistributionCreateModalProps = {
  onClose: () => void;
  onCreated: () => void;
};

export function DistributionCreateModal({ onClose, onCreated }: DistributionCreateModalProps) {
  const { repositoryOptions } = usePulpRepositoryOptions(true);
  const { publicationOptions } = usePulpPublicationOptions(true);
  const { plugins, getPlugin } = usePulpPluginsContext();
  const [contentGuards, setContentGuards] = useState<PulpContentGuard[]>([]);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const titleId = useId();

  const [kind, setKind] = useState<PulpPluginKind>(plugins[0].kind);
  const [name, setName] = useState("");
  const [basePath, setBasePath] = useState("");
  const [binding, setBinding] = useState<Binding>("none");
  const [repository, setRepository] = useState("");
  const [publication, setPublication] = useState("");
  const [contentGuard, setContentGuard] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const guards = await pulpContentGuardService.list(
          new URLSearchParams({ limit: "200", offset: "0" })
        );
        if (active) {
          setContentGuards(guards.results);
        }
      } catch (error) {
        if (active) {
          setModalError(
            error instanceof Error ? error.message : "Failed to load content guards."
          );
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

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

    setIsSaving(true);
    try {
      const result = await pulpDistributionService.createDistribution(kind, {
        name: trimmedName,
        base_path: trimmedBasePath,
        repository: binding === "repository" ? repository : null,
        publication: binding === "publication" ? publication : null,
        content_guard: contentGuard || null,
      });
      if (!result.ok) {
        throw new Error(result.detail);
      }
      onCreated();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Failed to create distribution.");
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
          New distribution
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
          <FormField label="Type">
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as PulpPluginKind)}
              disabled={isSaving}
              className={selectClassName}
            >
              {plugins.map((plugin) => (
                <option key={plugin.kind} value={plugin.kind}>
                  {plugin.label}
                </option>
              ))}
            </select>
          </FormField>
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
