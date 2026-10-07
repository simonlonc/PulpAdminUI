"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { usePulpAuthContext } from "./auth-context";
import { RowActionMenu } from "./row-action-menu";
import { Button } from "@/components/ui/button";
import { pulpImportService } from "@/services/pulp/import-service";
import { PulpImport, PulpImporter } from "@/services/pulp/types";

const HISTORY_LIMIT = 100;

function formatIso(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString();
}

export type ImporterImportsPanelProps = {
  importer: PulpImporter;
  /** Bump to reload the history, e.g. after an import was dispatched from the page. */
  refreshKey: number;
};

/** The import history of one importer: one entry per import, newest first. */
export function ImporterImportsPanel({ importer, refreshKey }: ImporterImportsPanelProps) {
  const { setError } = usePulpAuthContext();
  const [importRows, setImportRows] = useState<PulpImport[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const page = await pulpImportService.listImports(
          importer.pulp_href,
          new URLSearchParams({ limit: String(HISTORY_LIMIT), offset: "0" })
        );
        if (active) {
          setImportRows([...page.results].sort((a, b) => b.pulp_created.localeCompare(a.pulp_created)));
          setCount(page.count);
        }
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Failed to load imports.");
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
  }, [importer.pulp_href, refreshKey, reloads]);

  async function removeImport(importHref: string) {
    if (!window.confirm("Delete this import?")) {
      return;
    }

    setError(null);
    const result = await pulpImportService.removeImport(importHref);
    if (!result.ok) {
      setError(result.detail);
      return;
    }
    setReloads((value) => value + 1);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Imports of {importer.name}
          {count > 0 ? (
            <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
              ({count.toLocaleString()} total)
            </span>
          ) : null}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={isLoading}
          onClick={() => setReloads((value) => value + 1)}
        >
          Refresh
        </Button>
      </div>

      {loadError ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {loadError}
        </p>
      ) : null}

      {isLoading && importRows.length === 0 ? (
        <p className="text-sm text-zinc-500">Loading imports…</p>
      ) : null}

      {!isLoading && !loadError && importRows.length === 0 ? (
        <p className="text-sm text-zinc-500">No imports yet.</p>
      ) : null}

      {importRows.length > 0 ? (
        <ul className="space-y-3">
          {importRows.map((importRow) => (
            <li
              key={importRow.pulp_href}
              className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{formatIso(importRow.pulp_created)}</p>
                  {Object.entries(importRow.params ?? {}).map(([key, value]) => (
                    <p key={key} className="break-all font-mono text-xs text-zinc-500">
                      {key}: {String(value)}
                    </p>
                  ))}
                  {importRow.task ? (
                    <p className="break-all font-mono text-xs text-zinc-500">
                      Task:{" "}
                      <Link
                        href={`/tasks/detail?pulp_href=${encodeURIComponent(importRow.task)}`}
                        className="underline underline-offset-2"
                      >
                        {importRow.task}
                      </Link>
                    </p>
                  ) : null}
                </div>
                <RowActionMenu
                  label={`import of ${formatIso(importRow.pulp_created)}`}
                  items={[
                    {
                      key: "delete",
                      label: "Delete",
                      icon: Trash2,
                      destructive: true,
                      onSelect: () => void removeImport(importRow.pulp_href),
                    },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {count > importRows.length ? (
        <p className="text-xs text-zinc-500">
          Showing the first {importRows.length.toLocaleString()} of {count.toLocaleString()} imports.
        </p>
      ) : null}
    </div>
  );
}
