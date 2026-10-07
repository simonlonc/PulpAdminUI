"use client";

import { Suspense, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpFilesystemExporters } from "@/components/pulp/use-pulp-filesystem-exporters";
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
import { FilesystemExportRunModal } from "@/components/pulp/filesystem-export-run-modal";
import { FilesystemExporterCreateModal } from "@/components/pulp/filesystem-exporter-create-modal";
import { FilesystemExporterEditModal } from "@/components/pulp/filesystem-exporter-edit-modal";
import { ListPagination } from "@/components/pulp/list-pagination";
import { ListQueryBar, SortableColumnHeader } from "@/components/pulp/list-query-bar";
import { RowActionMenu } from "@/components/pulp/row-action-menu";
import { usePulpListQuery } from "@/components/pulp/use-pulp-list-query";
import { PulpFilesystemExporter } from "@/services/pulp/types";

function FilesystemExportersListPageContent() {
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { query, params, setOrdering, setPage, setPageSize, setFilters } = usePulpListQuery();
  const { exporters, count, deleteExporter, refreshExporters } = usePulpFilesystemExporters(
    hasSession,
    params
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PulpFilesystemExporter | null>(null);
  const [runTarget, setRunTarget] = useState<PulpFilesystemExporter | null>(null);

  const totalPages = Math.max(1, Math.ceil(count / query.pageSize));

  async function removeExporter(exporter: PulpFilesystemExporter) {
    if (!window.confirm(`Delete exporter “${exporter.name}”? This cannot be undone.`)) {
      return;
    }

    await deleteExporter(exporter.pulp_href);
  }

  return (
    <AdminShell
      title="Filesystem exporters"
      description="Write a publication's or repository version's files to a directory on the Pulp server."
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
            Filesystem exporters
            {count > 0 ? (
              <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
                ({count.toLocaleString()} total)
              </span>
            ) : null}
          </CardTitle>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(true)}>
                New filesystem exporter
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
                    <TableHeaderCell>
                      <SortableColumnHeader
                        label="Name"
                        field="name"
                        ordering={query.ordering}
                        onSort={setOrdering}
                      />
                    </TableHeaderCell>
                    <TableHeaderCell>Path</TableHeaderCell>
                    <TableHeaderCell>Method</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {exporters.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-zinc-500">
                        No filesystem exporters found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    exporters.map((exporter) => (
                      <TableRow key={exporter.pulp_href}>
                        <TableCell className="font-medium">{exporter.name}</TableCell>
                        <TableCell className="break-all font-mono text-xs">{exporter.path}</TableCell>
                        <TableCell>{exporter.method}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end">
                            <RowActionMenu
                              label={exporter.name}
                              items={[
                                {
                                  key: "edit",
                                  label: "Edit",
                                  icon: Pencil,
                                  disabled: isLoading,
                                  onSelect: () => setEditTarget(exporter),
                                },
                                {
                                  key: "exports",
                                  label: "Exports",
                                  icon: History,
                                  href: `/filesystem-exporters/exports?pulp_href=${encodeURIComponent(exporter.pulp_href)}`,
                                },
                                { key: "sep-1", separator: true },
                                {
                                  key: "run",
                                  label: "Run export",
                                  icon: Play,
                                  disabled: isLoading,
                                  onSelect: () => setRunTarget(exporter),
                                },
                                { key: "sep-2", separator: true },
                                {
                                  key: "delete",
                                  label: "Delete",
                                  icon: Trash2,
                                  destructive: true,
                                  disabled: isLoading,
                                  onSelect: () => removeExporter(exporter),
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
        <FilesystemExporterCreateModal
          onClose={() => setIsCreateOpen(false)}
          onCreated={() => {
            setIsCreateOpen(false);
            void refreshExporters();
          }}
        />
      ) : null}

      {editTarget ? (
        <FilesystemExporterEditModal
          exporter={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            void refreshExporters();
          }}
        />
      ) : null}

      {runTarget ? (
        <FilesystemExportRunModal exporter={runTarget} onClose={() => setRunTarget(null)} />
      ) : null}
    </AdminShell>
  );
}

function FilesystemExportersListSuspenseFallback() {
  const { sessionUser, isLoading, hasSession, error, logout } = usePulpAuthContext();

  return (
    <AdminShell
      title="Filesystem exporters"
      description="Write a publication's or repository version's files to a directory on the Pulp server."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      error={error}
      onLogout={logout}
    >
      <Card>Loading filesystem exporter list…</Card>
    </AdminShell>
  );
}

export default function FilesystemExportersListPage() {
  return (
    <Suspense fallback={<FilesystemExportersListSuspenseFallback />}>
      <FilesystemExportersListPageContent />
    </Suspense>
  );
}
