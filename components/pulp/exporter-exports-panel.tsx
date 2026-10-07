"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { usePulpAuthContext } from "./auth-context";
import { ExportFilesManifest } from "./export-files-manifest";
import { ExportPublishModal } from "./export-publish-modal";
import { RowActionMenu } from "./row-action-menu";
import { PulpRepositoryOption } from "./use-pulp-repository-options";
import { Button } from "@/components/ui/button";
import { exportManifestEntries, exportParamsSummary } from "@/lib/pulp-export-manifest";
import { pulpExportService } from "@/services/pulp/export-service";
import { PulpExport, PulpExporter } from "@/services/pulp/types";

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

export type ExporterExportsPanelProps = {
  exporter: PulpExporter;
  /** Bump to reload the history, e.g. after an export was dispatched from the page. */
  refreshKey: number;
  /** Where an export's files can be published; only the File repositories are offered. */
  repositoryOptions: PulpRepositoryOption[];
};

/** The export history of one exporter: one entry per export, newest first, files manifest included. */
export function ExporterExportsPanel({
  exporter,
  refreshKey,
  repositoryOptions,
}: ExporterExportsPanelProps) {
  const { setError } = usePulpAuthContext();
  const [exportRows, setExportRows] = useState<PulpExport[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const [publishTarget, setPublishTarget] = useState<PulpExport | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const page = await pulpExportService.listExports(
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
    const result = await pulpExportService.removeExport(exportHref);
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
            return (
              <li
                key={exportRow.pulp_href}
                className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">{formatIso(exportRow.pulp_created)}</p>
                    <p className="text-xs text-zinc-500">{summary || "Default options"}</p>
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
                        key: "publish",
                        label: "Publish to repository",
                        icon: Upload,
                        // A dry run never wrote its files, and there is nothing to publish without any.
                        disabled:
                          exportRow.params?.dry_run === true ||
                          exportManifestEntries(exportRow).length === 0,
                        onSelect: () => setPublishTarget(exportRow),
                      },
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
                <div className="mt-3">
                  <ExportFilesManifest exportRow={exportRow} />
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

      {publishTarget ? (
        <ExportPublishModal
          exportRow={publishTarget}
          repositoryOptions={repositoryOptions}
          onClose={() => setPublishTarget(null)}
        />
      ) : null}
    </div>
  );
}
