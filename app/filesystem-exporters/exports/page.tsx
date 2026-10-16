"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { FilesystemExportRunModal } from "@/components/pulp/filesystem-export-run-modal";
import { FilesystemExporterEditModal } from "@/components/pulp/filesystem-exporter-edit-modal";
import { RowActionMenu } from "@/components/pulp/row-action-menu";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";
import { pulpFilesystemExportService } from "@/services/pulp/filesystem-export-service";
import type { PulpFilesystemExport, PulpFilesystemExporter } from "@/services/pulp/types";

const HISTORY_LIMIT = 100;

/** "publication 01a1..." from an export's `params`, which name what was exported by bare uuid. */
function exportParamsSummary(params: PulpFilesystemExport["params"]): string {
  return Object.entries(params ?? {})
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => `${key.replace(/_/g, " ")} ${value}`)
    .join(", ");
}

function FilesystemExporterExportsInner() {
  const searchParams = useSearchParams();
  const pulpHref = searchParams.get("pulp_href")?.trim() ?? "";

  const { sessionUser, isLoading, isCheckingSession, hasSession, error, setError, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });

  const [exporter, setExporter] = useState<PulpFilesystemExporter | null>(null);
  const [count, setCount] = useState(0);
  const [exportRows, setExportRows] = useState<PulpFilesystemExport[]>([]);
  const [isLoadingExports, setIsLoadingExports] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isRunOpen, setIsRunOpen] = useState(false);

  const exporterRequestRef = useRef(0);
  const exportsRequestRef = useRef(0);

  const loadExporter = useCallback(async () => {
    if (!hasSession || !pulpHref) return;
    const requestId = ++exporterRequestRef.current;
    try {
      const data = await pulpFilesystemExportService.get(pulpHref);
      if (exporterRequestRef.current !== requestId) return;
      setExporter(data);
    } catch (e) {
      if (exporterRequestRef.current !== requestId) return;
      setExporter(null);
      setError(e instanceof Error ? e.message : "Failed to load filesystem exporter.");
    }
  }, [hasSession, pulpHref, setError]);

  const loadExports = useCallback(async () => {
    if (!hasSession || !pulpHref) return;
    const requestId = ++exportsRequestRef.current;
    setIsLoadingExports(true);
    setError(null);
    try {
      const data = await pulpFilesystemExportService.listExports(
        pulpHref,
        new URLSearchParams({ limit: String(HISTORY_LIMIT), offset: "0" })
      );
      if (exportsRequestRef.current !== requestId) return;
      // Newest first, whatever order Pulp answered in.
      setExportRows([...data.results].sort((a, b) => b.pulp_created.localeCompare(a.pulp_created)));
      setCount(data.count);
    } catch (e) {
      if (exportsRequestRef.current !== requestId) return;
      setExportRows([]);
      setCount(0);
      setError(e instanceof Error ? e.message : "Failed to load exports.");
    } finally {
      if (exportsRequestRef.current === requestId) setIsLoadingExports(false);
    }
  }, [hasSession, pulpHref, setError]);

  useEffect(() => {
    if (!hasSession || !pulpHref) {
      setExporter(null);
      setExportRows([]);
      setCount(0);
      return;
    }

    void loadExporter();
    void loadExports();

    return () => {
      exporterRequestRef.current += 1;
      exportsRequestRef.current += 1;
    };
  }, [hasSession, pulpHref, loadExporter, loadExports]);

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
    await loadExports();
  }

  return (
    <AdminShell
      title="Filesystem exports"
      description="Each export of this filesystem exporter. The files sit at the exporter's path on the Pulp server."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading || isLoadingExports}
      error={error}
      onLogout={logout}
    >
      {isCheckingSession || isRedirectingToLogin ? (
        <Card>Checking existing session...</Card>
      ) : !pulpHref ? (
        <Card>Missing pulp_href query parameter.</Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardTitle>Exporter</CardTitle>
            <CardContent className="space-y-2 text-sm">
              {exporter ? <p className="font-medium">{exporter.name}</p> : null}
              <p className="break-all font-mono text-xs">{pulpHref}</p>
              {exporter ? (
                <>
                  <p>
                    <span className="text-zinc-500">Path </span>
                    <span className="break-all font-mono text-xs">{exporter.path}</span>
                  </p>
                  <p>
                    <span className="text-zinc-500">Method </span>
                    {exporter.method}
                  </p>
                </>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardTitle>Exports ({count.toLocaleString()})</CardTitle>
            <CardContent className="space-y-3">
              <TableWrapper>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="whitespace-nowrap">Created</TableHeaderCell>
                      <TableHeaderCell>Parameters</TableHeaderCell>
                      <TableHeaderCell>Exported resources</TableHeaderCell>
                      <TableHeaderCell>Task</TableHeaderCell>
                      <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {exportRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-zinc-500">
                          {isLoadingExports ? "Loading exports…" : "No exports found."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      exportRows.map((exportRow) => (
                        <TableRow key={exportRow.pulp_href}>
                          <TableCell stack="heading" className="align-top whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400">
                            {exportRow.pulp_created || "-"}
                          </TableCell>
                          <TableCell label="Parameters" className="align-top break-all">
                            {exportParamsSummary(exportRow.params) || (
                              <span className="text-zinc-500">No parameters recorded</span>
                            )}
                          </TableCell>
                          <TableCell label="Exported" className="align-top">
                            {exportRow.exported_resources.length.toLocaleString()}
                          </TableCell>
                          <TableCell label="Task" className="align-top break-all font-mono text-xs">
                            {exportRow.task ? (
                              <Link
                                href={`/tasks/detail?pulp_href=${encodeURIComponent(exportRow.task)}`}
                                className="text-zinc-800 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600 dark:text-zinc-200"
                              >
                                {exportRow.task}
                              </Link>
                            ) : (
                              <span className="text-zinc-500">-</span>
                            )}
                          </TableCell>
                          <TableCell stack="actions" className="align-top text-right">
                            <div className="flex justify-end">
                              <RowActionMenu
                                label={`export of ${exportRow.pulp_created}`}
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
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableWrapper>
              {count > exportRows.length ? (
                <p className="text-xs text-zinc-500">
                  Showing the first {exportRows.length.toLocaleString()} of {count.toLocaleString()}{" "}
                  exports.
                </p>
              ) : null}
            </CardContent>
          </Card>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/filesystem-exporters/list"
              className="inline-flex rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Back to filesystem exporters
            </Link>
            <Button
              type="button"
              variant="outline"
              disabled={!exporter}
              onClick={() => setIsEditOpen(true)}
            >
              Edit exporter
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!exporter}
              onClick={() => setIsRunOpen(true)}
            >
              Run export
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isLoadingExports}
              onClick={() => {
                void loadExporter();
                void loadExports();
              }}
            >
              Refresh
            </Button>
          </div>
        </div>
      )}

      {isEditOpen && exporter ? (
        <FilesystemExporterEditModal
          exporter={exporter}
          onClose={() => setIsEditOpen(false)}
          onSaved={() => {
            setIsEditOpen(false);
            void loadExporter();
          }}
        />
      ) : null}

      {isRunOpen && exporter ? (
        <FilesystemExportRunModal
          exporter={exporter}
          onClose={(dispatched) => {
            setIsRunOpen(false);
            if (dispatched) {
              void loadExports();
            }
          }}
        />
      ) : null}
    </AdminShell>
  );
}

export default function FilesystemExporterExportsPage() {
  return (
    <Suspense fallback={<Card className="p-6">Loading…</Card>}>
      <FilesystemExporterExportsInner />
    </Suspense>
  );
}
