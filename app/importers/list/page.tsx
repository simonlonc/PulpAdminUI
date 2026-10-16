"use client";

import { Suspense, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpImporters } from "@/components/pulp/use-pulp-importers";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { History, Pencil, Play, Trash2 } from "lucide-react";
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
import { ImporterEditModal } from "@/components/pulp/importer-edit-modal";
import { ListPagination } from "@/components/pulp/list-pagination";
import { ListQueryBar, SortableColumnHeader, SortBar } from "@/components/pulp/list-query-bar";
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
  const [editTarget, setEditTarget] = useState<PulpImporter | null>(null);
  const [runTarget, setRunTarget] = useState<PulpImporter | null>(null);

  const totalPages = Math.max(1, Math.ceil(count / query.pageSize));

  async function removeImporter(importer: PulpImporter) {
    if (!window.confirm(`Delete importer “${importer.name}”? This cannot be undone.`)) {
      return;
    }

    await deleteImporter(importer.pulp_href);
  }

  return (
    <AdminShell
      title="Importers"
      description="Load an exported bundle from the Pulp server's filesystem into this Pulp server."
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
            <SortBar
              fields={[{ label: "Name", field: "name" }]}
              ordering={query.ordering}
              onSort={setOrdering}
            />
            <TableWrapper>
              <Table>
                <TableHead>
                  <TableRow>
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
                      <TableCell colSpan={3} className="text-zinc-500">
                        No importers found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    importers.map((importer) => {
                      const mapping = Object.entries(importer.repo_mapping);
                      return (
                        <TableRow key={importer.pulp_href}>
                          <TableCell stack="heading" className="font-medium">{importer.name}</TableCell>
                          <TableCell label="Mapping">
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
                          <TableCell stack="actions" className="text-right">
                            <div className="flex justify-end">
                              <RowActionMenu
                                label={importer.name}
                                items={[
                                  {
                                    key: "edit",
                                    label: "Edit",
                                    icon: Pencil,
                                    disabled: isLoading,
                                    onSelect: () => setEditTarget(importer),
                                  },
                                  {
                                    key: "imports",
                                    label: "Imports",
                                    icon: History,
                                    href: `/importers/imports?pulp_href=${encodeURIComponent(importer.pulp_href)}`,
                                  },
                                  { key: "sep-1", separator: true },
                                  {
                                    key: "run",
                                    label: "Run import",
                                    icon: Play,
                                    disabled: isLoading,
                                    onSelect: () => setRunTarget(importer),
                                  },
                                  { key: "sep-2", separator: true },
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

      {editTarget ? (
        <ImporterEditModal
          importer={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            void refreshImporters();
          }}
        />
      ) : null}

      {runTarget ? <ImportRunModal importer={runTarget} onClose={() => setRunTarget(null)} /> : null}
    </AdminShell>
  );
}

function ImportersListSuspenseFallback() {
  const { sessionUser, isLoading, hasSession, error, logout } = usePulpAuthContext();

  return (
    <AdminShell
      title="Importers"
      description="Load an exported bundle from the Pulp server's filesystem into this Pulp server."
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
