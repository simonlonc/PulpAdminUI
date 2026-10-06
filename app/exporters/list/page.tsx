"use client";

import { Fragment, Suspense, useMemo, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpExporters } from "@/components/pulp/use-pulp-exporters";
import { usePulpRepositoryOptions } from "@/components/pulp/use-pulp-repository-options";
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
import { ExportRunModal } from "@/components/pulp/export-run-modal";
import { ExporterCreateModal } from "@/components/pulp/exporter-create-modal";
import { ExporterExportsPanel } from "@/components/pulp/exporter-exports-panel";
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
  const [runTarget, setRunTarget] = useState<PulpExporter | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [historyRefreshes, setHistoryRefreshes] = useState<Record<string, number>>({});

  const repositoryNames = useMemo(
    () => new Map(repositoryOptions.map((option) => [option.href, option.name])),
    [repositoryOptions]
  );

  const totalPages = Math.max(1, Math.ceil(count / query.pageSize));

  function expand(href: string) {
    setExpanded((current) => (current.includes(href) ? current : [...current, href]));
  }

  function toggleExpanded(href: string) {
    setExpanded((current) =>
      current.includes(href) ? current.filter((item) => item !== href) : [...current, href]
    );
  }

  async function removeExporter(exporter: PulpExporter) {
    if (!window.confirm(`Delete exporter "${exporter.name}"?`)) {
      return;
    }

    await deleteExporter(exporter.pulp_href);
  }

  function closeRunModal(dispatched: boolean) {
    if (runTarget && dispatched) {
      const href = runTarget.pulp_href;
      setHistoryRefreshes((current) => ({ ...current, [href]: (current[href] ?? 0) + 1 }));
      expand(href);
      void refreshExporters();
    }
    setRunTarget(null);
  }

  return (
    <AdminShell
      title="Exporters"
      description="Export repositories as a portable bundle to load into another Pulp server."
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
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              An export writes a bundle to the exporter&apos;s path on the Pulp server&apos;s own
              filesystem. Pulp does not send the bundle back, so this app lists it and shows the
              checksum of each file to verify it with, but cannot download it. Carrying the bundle
              to the other Pulp is a step outside this app.
            </p>
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
                    <TableHeaderCell className="w-10">
                      <span className="sr-only">Exports</span>
                    </TableHeaderCell>
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
                    <TableHeaderCell>Last export</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {exporters.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-zinc-500">
                        No exporters found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    exporters.map((exporter) => {
                      const isExpanded = expanded.includes(exporter.pulp_href);
                      const ToggleIcon = isExpanded ? ChevronDown : ChevronRight;
                      return (
                        <Fragment key={exporter.pulp_href}>
                          <TableRow>
                            <TableCell>
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                aria-label={`${isExpanded ? "Hide" : "Show"} exports of ${exporter.name}`}
                                onClick={() => toggleExpanded(exporter.pulp_href)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
                              >
                                <ToggleIcon className="size-4" aria-hidden />
                              </button>
                            </TableCell>
                            <TableCell className="font-medium">{exporter.name}</TableCell>
                            <TableCell className="break-all font-mono text-xs">
                              {exporter.path}
                            </TableCell>
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
                            <TableCell>
                              {exporter.last_export ? (
                                <button
                                  type="button"
                                  onClick={() => expand(exporter.pulp_href)}
                                  className="underline underline-offset-2"
                                >
                                  See history
                                </button>
                              ) : (
                                <span className="text-zinc-500">Never</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end">
                                <RowActionMenu
                                  label={exporter.name}
                                  items={[
                                    {
                                      key: "run",
                                      label: "Run export",
                                      icon: Play,
                                      disabled: isLoading,
                                      onSelect: () => setRunTarget(exporter),
                                    },
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
                          {isExpanded ? (
                            <TableRow>
                              <TableCell colSpan={6} className="bg-zinc-50/60 dark:bg-zinc-900/30">
                                <ExporterExportsPanel
                                  exporter={exporter}
                                  refreshKey={historyRefreshes[exporter.pulp_href] ?? 0}
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
        <ExporterCreateModal
          repositoryOptions={repositoryOptions}
          onClose={() => setIsCreateOpen(false)}
          onCreated={() => {
            setIsCreateOpen(false);
            void refreshExporters();
          }}
        />
      ) : null}

      {runTarget ? <ExportRunModal exporter={runTarget} onClose={closeRunModal} /> : null}
    </AdminShell>
  );
}

function ExportersListSuspenseFallback() {
  const { sessionUser, isLoading, hasSession, error, logout } = usePulpAuthContext();

  return (
    <AdminShell
      title="Exporters"
      description="Export repositories as a portable bundle to load into another Pulp server."
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
