"use client";

import { Fragment, Suspense, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpImporters } from "@/components/pulp/use-pulp-importers";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { ChevronDown, ChevronRight, Play, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";
import { ImportRunModal } from "@/components/pulp/import-run-modal";
import { ImporterCreateModal } from "@/components/pulp/importer-create-modal";
import { ImporterImportsPanel } from "@/components/pulp/importer-imports-panel";
import { ListPagination } from "@/components/pulp/list-pagination";
import { ListQueryBar, SortableColumnHeader } from "@/components/pulp/list-query-bar";
import { RowActionMenu } from "@/components/pulp/row-action-menu";
import { usePulpListQuery } from "@/components/pulp/use-pulp-list-query";
import { PulpImporter } from "@/services/pulp/types";

function ImportersListPageContent() {
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { query, params, setOrdering, setPage, setPageSize, setFilters } = usePulpListQuery();
  const { importers, count, deleteImporter, refreshImporters } = usePulpImporters(
    hasSession,
    params
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [runTarget, setRunTarget] = useState<PulpImporter | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [historyRefreshes, setHistoryRefreshes] = useState<Record<string, number>>({});

  const totalPages = Math.max(1, Math.ceil(count / query.pageSize));

  function expand(href: string) {
    setExpanded((current) => (current.includes(href) ? current : [...current, href]));
  }

  function toggleExpanded(href: string) {
    setExpanded((current) =>
      current.includes(href) ? current.filter((item) => item !== href) : [...current, href]
    );
  }

  async function removeImporter(importer: PulpImporter) {
    if (!window.confirm(`Delete importer "${importer.name}"?`)) {
      return;
    }

    await deleteImporter(importer.pulp_href);
  }

  function closeRunModal(dispatched: boolean) {
    if (runTarget && dispatched) {
      const href = runTarget.pulp_href;
      setHistoryRefreshes((current) => ({ ...current, [href]: (current[href] ?? 0) + 1 }));
      expand(href);
    }
    setRunTarget(null);
  }

  return (
    <AdminShell
      title="Importers"
      description="Load an exported bundle into this Pulp server."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      error={error}
      onLogout={logout}
    >
      {isCheckingSession || isRedirectingToLogin ? (
        <Card>Checking existing session...</Card>
      ) : (
        <Card>
          <CardTitle>
            Importers
            {count > 0 ? (
              <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
                ({count.toLocaleString()} total)
              </span>
            ) : null}
          </CardTitle>
          <CardContent className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              An import reads a bundle from the Pulp server&apos;s own filesystem, so the bundle has
              to be carried to that server first; this app cannot upload one. An importer holds the
              repository mapping. Its row menu runs an import, but only once the bundle has passed a
              check. To change a mapping, delete the importer and create it again.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(true)}>
                New importer
              </Button>
            </div>
            <ListQueryBar
              search={query.search}
              pageSize={query.pageSize}
              onPageSizeChange={setPageSize}
              onFiltersChange={setFilters}
              disabled={isLoading}
              q={query.q}
              showQ
            />
            <TableWrapper>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell className="w-10">
                      <span className="sr-only">Imports</span>
                    </TableHeaderCell>
                    <TableHeaderCell>
                      <SortableColumnHeader
                        label="Name"
                        field="name"
                        ordering={query.ordering}
                        onSort={setOrdering}
                      />
                    </TableHeaderCell>
                    <TableHeaderCell>Repository mapping</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {importers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-zinc-500">
                        No importers found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    importers.map((importer) => {
                      const isExpanded = expanded.includes(importer.pulp_href);
                      const ToggleIcon = isExpanded ? ChevronDown : ChevronRight;
                      const mapping = Object.entries(importer.repo_mapping);
                      return (
                        <Fragment key={importer.pulp_href}>
                          <TableRow>
                            <TableCell>
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                aria-label={`${isExpanded ? "Hide" : "Show"} imports of ${importer.name}`}
                                onClick={() => toggleExpanded(importer.pulp_href)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
                              >
                                <ToggleIcon className="size-4" aria-hidden />
                              </button>
                            </TableCell>
                            <TableCell className="font-medium">{importer.name}</TableCell>
                            <TableCell>
                              {mapping.length === 0 ? (
                                <span className="text-zinc-500">None</span>
                              ) : (
                                <ul className="space-y-0.5">
                                  {mapping.map(([exportName, localName]) => (
                                    <li key={exportName} className="break-all font-mono text-xs">
                                      {`${exportName} -> ${localName}`}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end">
                                <RowActionMenu
                                  label={importer.name}
                                  items={[
                                    {
                                      key: "run",
                                      label: "Run import",
                                      icon: Play,
                                      disabled: isLoading,
                                      onSelect: () => setRunTarget(importer),
                                    },
                                    {
                                      key: "delete",
                                      label: "Delete",
                                      icon: Trash2,
                                      destructive: true,
                                      disabled: isLoading,
                                      onSelect: () => removeImporter(importer),
                                    },
                                  ]}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                          {isExpanded ? (
                            <TableRow>
                              <TableCell colSpan={4} className="bg-zinc-50/60 dark:bg-zinc-900/30">
                                <ImporterImportsPanel
                                  importer={importer}
                                  refreshKey={historyRefreshes[importer.pulp_href] ?? 0}
                                />
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableWrapper>
            <ListPagination
              page={query.page}
              totalPages={totalPages}
              onPageChange={setPage}
              disabled={isLoading}
            />
          </CardContent>
        </Card>
      )}

      {isCreateOpen ? (
        <ImporterCreateModal
          onClose={() => setIsCreateOpen(false)}
          onCreated={() => {
            setIsCreateOpen(false);
            void refreshImporters();
          }}
        />
      ) : null}

      {runTarget ? <ImportRunModal importer={runTarget} onClose={closeRunModal} /> : null}
    </AdminShell>
  );
}

function ImportersListSuspenseFallback() {
  const { sessionUser, isLoading, hasSession, error, logout } = usePulpAuthContext();

  return (
    <AdminShell
      title="Importers"
      description="Load an exported bundle into this Pulp server."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      error={error}
      onLogout={logout}
    >
      <Card>Loading importer list…</Card>
    </AdminShell>
  );
}

export default function ImportersListPage() {
  return (
    <Suspense fallback={<ImportersListSuspenseFallback />}>
      <ImportersListPageContent />
    </Suspense>
  );
}
