"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { usePulpAuthContext } from "./auth-context";
import { RowActionMenu } from "./row-action-menu";
import { Button } from "@/components/ui/button";
import { pulpFilesystemExportService } from "@/services/pulp/filesystem-export-service";
import { PulpFilesystemExport, PulpFilesystemExporter } from "@/services/pulp/types";

const HISTORY_LIMIT = 100;

function formatIso(iso: string | null): string {
  if (!iso) {
    return "-";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString();
}

/** "publication 01a1..." from an export's `params`, which name what was exported by bare uuid. */
function exportParamsSummary(params: PulpFilesystemExport["params"]): string {
  return Object.entries(params ?? {})
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => `${key.replace(/_/g, " ")} ${value}`)
    .join(", ");
}

export type FilesystemExporterExportsPanelProps = {
  exporter: PulpFilesystemExporter;
  /** Bump to reload the history, e.g. after an export was dispatched from the page. */
  refreshKey: number;
};

/** The export history of one filesystem exporter, newest first. There is no files manifest to show. */
export function FilesystemExporterExportsPanel({
  exporter,
  refreshKey,
}: FilesystemExporterExportsPanelProps) {
  const { setError } = usePulpAuthContext();
  const [exportRows, setExportRows] = useState<PulpFilesystemExport[]>([]);
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
        const page = await pulpFilesystemExportService.listExports(
          exporter.pulp_href,
          new URLSearchParams({ limit: String(HISTORY_LIMIT), offset: "0" })
        );
        if (active) {
          setExportRows([...page.results].sort((a, b) => b.pulp_created.localeCompare(a.pulp_created)));
          setCount(page.count);
        }
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Failed to load exports.");
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
  }, [exporter.pulp_href, refreshKey, reloads]);

  async function removeExport(exportHref: string) {
    if (!window.confirm("Delete this export?")) {
      return;
    }

    setError(null);
    const result = await pulpFilesystemExportService.removeExport(exportHref);
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
          Exports of {exporter.name}
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

      {isLoading && exportRows.length === 0 ? (
        <p className="text-sm text-zinc-500">Loading exports…</p>
      ) : null}

      {!isLoading && !loadError && exportRows.length === 0 ? (
        <p className="text-sm text-zinc-500">No exports yet.</p>
      ) : null}

      {exportRows.length > 0 ? (
        <ul className="space-y-3">
          {exportRows.map((exportRow) => {
            const summary = exportParamsSummary(exportRow.params);
            const resourceCount = exportRow.exported_resources.length;
            return (
              <li
                key={exportRow.pulp_href}
                className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">{formatIso(exportRow.pulp_created)}</p>
                    <p className="break-all text-xs text-zinc-500">{summary || "No parameters recorded"}</p>
                    <p className="text-xs text-zinc-500">
                      {resourceCount.toLocaleString()} exported{" "}
                      {resourceCount === 1 ? "resource" : "resources"}
                    </p>
                    {exportRow.task ? (
                      <p className="break-all font-mono text-xs text-zinc-500">
                        Task:{" "}
                        <Link
                          href={`/tasks/detail?pulp_href=${encodeURIComponent(exportRow.task)}`}
                          className="underline underline-offset-2"
                        >
                          {exportRow.task}
                        </Link>
                      </p>
                    ) : null}
                  </div>
                  <RowActionMenu
                    label={`export of ${formatIso(exportRow.pulp_created)}`}
                    items={[
                      {
                        key: "delete",
                        label: "Delete",
                        icon: Trash2,
                        destructive: true,
                        onSelect: () => void removeExport(exportRow.pulp_href),
                      },
                    ]}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {count > exportRows.length ? (
        <p className="text-xs text-zinc-500">
          Showing the first {exportRows.length.toLocaleString()} of {count.toLocaleString()} exports.
        </p>
      ) : null}
    </div>
  );
}
