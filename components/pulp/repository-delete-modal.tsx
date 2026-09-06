"use client";

import { useEffect, useId, useState } from "react";
import { usePulpAuthContext } from "./auth-context";
import { usePulpPluginsContext } from "./plugins-context";
import { Button } from "@/components/ui/button";
import { type PulpPluginKind } from "@/lib/pulp-plugins";
import { pulpDistributionService } from "@/services/pulp/distribution-service";
import { pulpRepositoryManagementService } from "@/services/pulp/repository-management-service";
import { PulpDistribution, PulpRepository } from "@/services/pulp/types";

/** Distributions of the given kind, linked to this repository, deletable via `/api/pulp/distributions/[id]`. */
function distributionsForRepository(
  distributions: PulpDistribution[],
  repoPulpHref: string,
  distributionPath: string
): PulpDistribution[] {
  return distributions.filter(
    (d) => d.repository === repoPulpHref && d.pulp_href.includes(distributionPath)
  );
}

export type RepositoryDeleteModalProps = {
  repo: PulpRepository;
  kind: PulpPluginKind;
  distributions: PulpDistribution[];
  onClose: () => void;
  onDeleted: () => void;
  onBusyChange: (busy: boolean) => void;
};

export function RepositoryDeleteModal({
  repo,
  kind,
  distributions,
  onClose,
  onDeleted,
  onBusyChange,
}: RepositoryDeleteModalProps) {
  const { setError } = usePulpAuthContext();
  const { getPlugin } = usePulpPluginsContext();
  const titleId = useId();

  const linked = distributionsForRepository(distributions, repo.pulp_href, getPlugin(kind).distributionPath);
  const [deleteAlsoDistributions, setDeleteAlsoDistributions] = useState(linked.length > 0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isDeleting) {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isDeleting, onClose]);

  function close() {
    if (isDeleting) return;
    onClose();
  }

  async function handleDelete() {
    onBusyChange(true);
    setError(null);
    setIsDeleting(true);
    try {
      if (deleteAlsoDistributions && linked.length > 0) {
        for (const d of linked) {
          const removed = await pulpDistributionService.remove(d.pulp_href);
          if (!removed.ok) {
            throw new Error(removed.detail);
          }
        }
      }

      const removedRepo = await pulpRepositoryManagementService.remove(kind, repo.pulp_href);
      if (!removedRepo.ok) {
        throw new Error(removedRepo.detail);
      }

      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      onBusyChange(false);
      setIsDeleting(false);
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
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Delete repository?
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">{repo.name}</span>
          <span className="mt-1 block break-all font-mono text-xs text-zinc-500 dark:text-zinc-500">
            {repo.pulp_href}
          </span>
        </p>
        {linked.length > 0 ? (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0"
              checked={deleteAlsoDistributions}
              disabled={isDeleting}
              onChange={(e) => setDeleteAlsoDistributions(e.target.checked)}
            />
            <span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                Also delete linked {getPlugin(kind).label} distribution
                {linked.length > 1 ? "s" : ""}
              </span>
              <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                {linked.map((d) => d.name).join(", ")}
              </span>
            </span>
          </label>
        ) : (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            No {getPlugin(kind).label} distribution in the list is linked to this repository.
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={isDeleting} onClick={close}>
            Cancel
          </Button>
          <Button
            type="button"
            className="border-red-300 bg-red-600 text-white hover:bg-red-700 dark:border-red-800 dark:bg-red-700 dark:hover:bg-red-600"
            disabled={isDeleting}
            onClick={() => void handleDelete()}
          >
            {isDeleting ? "Deleting…" : "Delete repository"}
          </Button>
        </div>
      </div>
    </div>
  );
}
