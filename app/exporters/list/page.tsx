"use client";

import { Suspense, useMemo, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpExporters } from "@/components/pulp/use-pulp-exporters";
import { usePulpRepositoryOptions } from "@/components/pulp/use-pulp-repository-options";
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
import { ExportRunModal } from "@/components/pulp/export-run-modal";
import { ExporterCreateModal } from "@/components/pulp/exporter-create-modal";
import { ExporterEditModal } from "@/components/pulp/exporter-edit-modal";
import { ListPagination } from "@/components/pulp/list-pagination";
import { ListQueryBar, SortableColumnHeader } from "@/components/pulp/list-query-bar";
import { RowActionMenu } from "@/components/pulp/row-action-menu";
import { usePulpListQuery } from "@/components/pulp/use-pulp-list-query";
import { PulpExporter } from "@/services/pulp/types";

function ExportersListPageContent() {
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { query, params, setOrdering, setPage, setPageSize, setFilters } = usePulpListQuery();
  const { exporters, count, deleteExporter, refreshExporters } = usePulpExporters(
    hasSession,
    params
  );
  const { repositoryOptions } = usePulpRepositoryOptions(hasSession);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PulpExporter | null>(null);
  const [runTarget, setRunTarget] = useState<PulpExporter | null>(null);

  const repositoryNames = useMemo(
    () => new Map(repositoryOptions.map((option) => [option.href, option.name])),
    [repositoryOptions]
  );

  const totalPages = Math.max(1, Math.ceil(count / query.pageSize));

  async function removeExporter(exporter: PulpExporter) {
    if (!window.confirm(`Delete exporter “${exporter.name}”? This cannot be undone.`)) {
      return;
    }

    await deleteExporter(exporter.pulp_href);
  }

  return (
    <AdminShell
      title="Exporters"
      description="Export repositories as a bundle on the Pulp server, to load into another Pulp server."
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
            Exporters
            {count > 0 ? (
              <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
                ({count.toLocaleString()} total)
              </span>
            ) : null}
          </CardTitle>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(true)}>
                New exporter
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
                    <TableHeaderCell>Repositories</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {exporters.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-zinc-500">
                        No exporters found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    exporters.map((exporter) => (
                      <TableRow key={exporter.pulp_href}>
                        <TableCell className="font-medium">{exporter.name}</TableCell>
                        <TableCell className="break-all font-mono text-xs">{exporter.path}</TableCell>
                        <TableCell>
                          {exporter.repositories.length === 0 ? (
                            <span className="text-zinc-500">None</span>
                          ) : (
                            <ul className="space-y-0.5">
                              {exporter.repositories.map((href) => {
                                const name = repositoryNames.get(href);
                                return name ? (
                                  <li key={href}>{name}</li>
                                ) : (
                                  <li key={href} className="break-all font-mono text-xs">
                                    {href}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </TableCell>
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
                                  href: `/exporters/exports?pulp_href=${encodeURIComponent(exporter.pulp_href)}`,
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
        <ExporterCreateModal
          repositoryOptions={repositoryOptions}
          onClose={() => setIsCreateOpen(false)}
          onCreated={() => {
            setIsCreateOpen(false);
            void refreshExporters();
          }}
        />
      ) : null}

      {editTarget ? (
        <ExporterEditModal
          exporter={editTarget}
          repositoryOptions={repositoryOptions}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            void refreshExporters();
          }}
        />
      ) : null}

      {runTarget ? <ExportRunModal exporter={runTarget} onClose={() => setRunTarget(null)} /> : null}
    </AdminShell>
  );
}

function ExportersListSuspenseFallback() {
  const { sessionUser, isLoading, hasSession, error, logout } = usePulpAuthContext();

  return (
    <AdminShell
      title="Exporters"
      description="Export repositories as a bundle on the Pulp server, to load into another Pulp server."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      error={error}
      onLogout={logout}
    >
      <Card>Loading exporter list…</Card>
    </AdminShell>
  );
}

export default function ExportersListPage() {
  return (
    <Suspense fallback={<ExportersListSuspenseFallback />}>
      <ExportersListPageContent />
    </Suspense>
  );
}
