"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { ImportRunModal } from "@/components/pulp/import-run-modal";
import { ImporterEditModal } from "@/components/pulp/importer-edit-modal";
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
import { pulpImportService } from "@/services/pulp/import-service";
import type { PulpImport, PulpImporter } from "@/services/pulp/types";

const HISTORY_LIMIT = 100;

function ImporterImportsInner() {
  const searchParams = useSearchParams();
  const pulpHref = searchParams.get("pulp_href")?.trim() ?? "";

  const { sessionUser, isLoading, isCheckingSession, hasSession, error, setError, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });

  const [importer, setImporter] = useState<PulpImporter | null>(null);
  const [count, setCount] = useState(0);
  const [importRows, setImportRows] = useState<PulpImport[]>([]);
  const [isLoadingImports, setIsLoadingImports] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isRunOpen, setIsRunOpen] = useState(false);

  const importerRequestRef = useRef(0);
  const importsRequestRef = useRef(0);

  const loadImporter = useCallback(async () => {
    if (!hasSession || !pulpHref) return;
    const requestId = ++importerRequestRef.current;
    try {
      const data = await pulpImportService.get(pulpHref);
      if (importerRequestRef.current !== requestId) return;
      setImporter(data);
    } catch (e) {
      if (importerRequestRef.current !== requestId) return;
      setImporter(null);
      setError(e instanceof Error ? e.message : "Failed to load importer.");
    }
  }, [hasSession, pulpHref, setError]);

  const loadImports = useCallback(async () => {
    if (!hasSession || !pulpHref) return;
    const requestId = ++importsRequestRef.current;
    setIsLoadingImports(true);
    setError(null);
    try {
      const data = await pulpImportService.listImports(
        pulpHref,
        new URLSearchParams({ limit: String(HISTORY_LIMIT), offset: "0" })
      );
      if (importsRequestRef.current !== requestId) return;
      // Newest first, whatever order Pulp answered in.
      setImportRows([...data.results].sort((a, b) => b.pulp_created.localeCompare(a.pulp_created)));
      setCount(data.count);
    } catch (e) {
      if (importsRequestRef.current !== requestId) return;
      setImportRows([]);
      setCount(0);
      setError(e instanceof Error ? e.message : "Failed to load imports.");
    } finally {
      if (importsRequestRef.current === requestId) setIsLoadingImports(false);
    }
  }, [hasSession, pulpHref, setError]);

  useEffect(() => {
    if (!hasSession || !pulpHref) {
      setImporter(null);
      setImportRows([]);
      setCount(0);
      return;
    }

    void loadImporter();
    void loadImports();

    return () => {
      importerRequestRef.current += 1;
      importsRequestRef.current += 1;
    };
  }, [hasSession, pulpHref, loadImporter, loadImports]);

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
    await loadImports();
  }

  const mapping = Object.entries(importer?.repo_mapping ?? {});

  return (
    <AdminShell
      title="Imports"
      description="Each import run through this importer. An import reads its bundle from the Pulp server's own filesystem."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading || isLoadingImports}
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
            <CardTitle>Importer</CardTitle>
            <CardContent className="space-y-2 text-sm">
              {importer ? <p className="font-medium">{importer.name}</p> : null}
              <p className="break-all font-mono text-xs">{pulpHref}</p>
              {importer ? (
                <div>
                  <p className="text-zinc-500">Repository mapping</p>
                  {mapping.length === 0 ? (
                    <p>None</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {mapping.map(([exportName, localName]) => (
                        <li key={exportName} className="break-all font-mono text-xs">
                          {`${exportName} -> ${localName}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardTitle>Imports ({count.toLocaleString()})</CardTitle>
            <CardContent className="space-y-3">
              <TableWrapper>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="whitespace-nowrap">Created</TableHeaderCell>
                      <TableHeaderCell>Source</TableHeaderCell>
                      <TableHeaderCell>Task</TableHeaderCell>
                      <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {importRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-zinc-500">
                          {isLoadingImports ? "Loading imports…" : "No imports found."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      importRows.map((importRow) => (
                        <TableRow key={importRow.pulp_href}>
                          <TableCell stack="heading" className="align-top whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400">
                            {importRow.pulp_created || "-"}
                          </TableCell>
                          <TableCell label="Source" className="align-top">
                            {Object.entries(importRow.params ?? {}).map(([key, value]) => (
                              <p key={key} className="break-all font-mono text-xs">
                                <span className="text-zinc-500">{key}</span> {String(value)}
                              </p>
                            ))}
                          </TableCell>
                          <TableCell label="Task" className="align-top break-all font-mono text-xs">
                            {importRow.task ? (
                              <Link
                                href={`/tasks/detail?pulp_href=${encodeURIComponent(importRow.task)}`}
                                className="text-zinc-800 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600 dark:text-zinc-200"
                              >
                                {importRow.task}
                              </Link>
                            ) : (
                              <span className="text-zinc-500">-</span>
                            )}
                          </TableCell>
                          <TableCell stack="actions" className="align-top text-right">
                            <div className="flex justify-end">
                              <RowActionMenu
                                label={`import of ${importRow.pulp_created}`}
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
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableWrapper>
              {count > importRows.length ? (
                <p className="text-xs text-zinc-500">
                  Showing the first {importRows.length.toLocaleString()} of {count.toLocaleString()}{" "}
                  imports.
                </p>
              ) : null}
            </CardContent>
          </Card>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/importers/list"
              className="inline-flex rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Back to importers
            </Link>
            <Button
              type="button"
              variant="outline"
              disabled={!importer}
              onClick={() => setIsEditOpen(true)}
            >
              Edit importer
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!importer}
              onClick={() => setIsRunOpen(true)}
            >
              Run import
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isLoadingImports}
              onClick={() => {
                void loadImporter();
                void loadImports();
              }}
            >
              Refresh
            </Button>
          </div>
        </div>
      )}

      {isEditOpen && importer ? (
        <ImporterEditModal
          importer={importer}
          onClose={() => setIsEditOpen(false)}
          onSaved={() => {
            setIsEditOpen(false);
            void loadImporter();
          }}
        />
      ) : null}

      {isRunOpen && importer ? (
        <ImportRunModal
          importer={importer}
          onClose={(dispatched) => {
            setIsRunOpen(false);
            if (dispatched) {
              void loadImports();
            }
          }}
        />
      ) : null}
    </AdminShell>
  );
}

export default function ImporterImportsPage() {
  return (
    <Suspense fallback={<Card className="p-6">Loading…</Card>}>
      <ImporterImportsInner />
    </Suspense>
  );
}
