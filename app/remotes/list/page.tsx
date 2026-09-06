"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpPluginsContext } from "@/components/pulp/plugins-context";
import { usePulpGroups } from "@/components/pulp/use-pulp-groups";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { usePulpUsers } from "@/components/pulp/use-pulp-users";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";
import { AccessPanelModal } from "@/components/pulp/access-panel";
import { LabelChips, LabelEditorModal } from "@/components/pulp/label-editor";
import { ListPagination } from "@/components/pulp/list-pagination";
import { ListQueryBar, SortableColumnHeader } from "@/components/pulp/list-query-bar";
import { RemoteFormModal } from "@/components/pulp/remote-form-modal";
import { usePulpListQuery } from "@/components/pulp/use-pulp-list-query";
import { buildPulpListParams } from "@/lib/pulp-list-query";
import { pulpRemoteService } from "@/services/pulp/remote-service";
import { type PulpPluginKind } from "@/lib/pulp-plugins";
import { PulpRemote } from "@/services/pulp/types";

type RemoteRow = PulpRemote;

const selectClassName =
  "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

function formatIso(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString();
}

function RemotesListPageContent() {
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, setError, logout } =
    usePulpAuthContext();
  const { plugins } = usePulpPluginsContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);
  const { query, setSearch, setOrdering, setPage, setPageSize, setQ, setLabelSelect } =
    usePulpListQuery();

  const [kind, setKind] = useState<PulpPluginKind>("rpm");
  const [remotes, setRemotes] = useState<RemoteRow[]>([]);
  const [count, setCount] = useState(0);
  const [isLoadingRemotes, setIsLoadingRemotes] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<RemoteRow | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [busyHref, setBusyHref] = useState<string | null>(null);
  const [labelsTarget, setLabelsTarget] = useState<RemoteRow | null>(null);
  const [accessTarget, setAccessTarget] = useState<RemoteRow | null>(null);

  const totalPages = Math.max(1, Math.ceil(count / query.pageSize));

  const load = useCallback(async () => {
    if (!hasSession) return;
    setIsLoadingRemotes(true);
    setError(null);
    try {
      const page = await pulpRemoteService.list(kind, buildPulpListParams(query));
      setRemotes(page.results);
      setCount(page.count);
    } catch (e) {
      setRemotes([]);
      setCount(0);
      setError(e instanceof Error ? e.message : "Failed to load remotes.");
    } finally {
      setIsLoadingRemotes(false);
    }
  }, [hasSession, kind, query, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const modalOpen = createOpen || editing !== null;

  function closeModal() {
    setCreateOpen(false);
    setEditing(null);
  }

  function openCreate() {
    setEditing(null);
    setCreateOpen(true);
  }

  function openEdit(remote: RemoteRow) {
    setCreateOpen(false);
    setEditing(remote);
  }

  async function handleDelete(remote: RemoteRow) {
    if (!window.confirm(`Delete remote “${remote.name}”? This cannot be undone.`)) {
      return;
    }
    setBusyHref(remote.pulp_href);
    setError(null);
    try {
      const result = await pulpRemoteService.remove(kind, remote.pulp_href);
      if (!result.ok) {
        setError(result.detail);
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusyHref(null);
    }
  }

  return (
    <AdminShell
      title="Remotes"
      description="Remotes describe an upstream repository to sync content from. Create, edit, or remove remotes here, then sync a repository against one."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading || isLoadingRemotes || isSaving}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      {isCheckingSession || isRedirectingToLogin ? (
        <Card>Checking existing session...</Card>
      ) : (
        <Card className="flex flex-col gap-0 p-0">
          <div className="flex flex-col gap-3 border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800/80 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="mb-0">
              Remotes — {kind.toUpperCase()}
              {count > 0 ? (
                <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
                  ({count.toLocaleString()} total)
                </span>
              ) : null}
            </CardTitle>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void load()}
                disabled={isLoadingRemotes}
              >
                Refresh
              </Button>
              <Button type="button" onClick={openCreate} disabled={isLoading}>
                Create remote
              </Button>
            </div>
          </div>
          <div className="border-b border-zinc-200/80 px-5 py-3 dark:border-zinc-800/80">
            {/* selectClassName on this page is w-full for the modal forms, so the filter
                is constrained here rather than stretching the whole card. */}
            <div className="max-w-xs">
              <FormField label="Type">
                <select
                  value={kind}
                  onChange={(event) => {
                    setKind(event.target.value as PulpPluginKind);
                    setPage(1);
                  }}
                  disabled={isLoadingRemotes}
                  className={selectClassName}
                >
                  {plugins.map((p) => (
                    <option key={p.kind} value={p.kind}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          </div>
          <CardContent className="space-y-4 p-5">
            <ListQueryBar
              search={query.search}
              onSearchChange={setSearch}
              pageSize={query.pageSize}
              onPageSizeChange={setPageSize}
              disabled={isLoadingRemotes}
              q={query.q}
              onQChange={setQ}
              labelSelect={query.labelSelect}
              onLabelSelectChange={setLabelSelect}
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
                    <TableHeaderCell>URL</TableHeaderCell>
                    <TableHeaderCell>Policy</TableHeaderCell>
                    <TableHeaderCell>TLS</TableHeaderCell>
                    <TableHeaderCell>Updated</TableHeaderCell>
                    <TableHeaderCell>Labels</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {isLoadingRemotes && remotes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-zinc-500">
                        Loading remotes…
                      </TableCell>
                    </TableRow>
                  ) : !isLoadingRemotes && remotes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-zinc-500">
                        No {kind.toUpperCase()} remotes yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    remotes.map((remote) => (
                      <TableRow key={remote.pulp_href}>
                        <TableCell className="max-w-[16rem] font-medium">
                          <span title={remote.name}>{remote.name}</span>
                        </TableCell>
                        <TableCell className="max-w-[24rem] font-mono text-xs">
                          <span className="break-all" title={remote.url}>
                            {remote.url}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {remote.policy}
                        </TableCell>
                        <TableCell>
                          {remote.tls_validation ? (
                            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                              on
                            </span>
                          ) : (
                            <span className="rounded-md bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                              off
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatIso(remote.pulp_last_updated ?? remote.pulp_created)}
                        </TableCell>
                        <TableCell>
                          <LabelChips labels={remote.pulp_labels} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="px-3 py-1.5 text-xs"
                              onClick={() => openEdit(remote)}
                              disabled={isLoading || busyHref === remote.pulp_href}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="px-3 py-1.5 text-xs"
                              onClick={() => setLabelsTarget(remote)}
                              disabled={isLoading || busyHref === remote.pulp_href}
                            >
                              Labels
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="px-3 py-1.5 text-xs"
                              onClick={() => setAccessTarget(remote)}
                              disabled={isLoading || busyHref === remote.pulp_href}
                            >
                              Access
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                              onClick={() => void handleDelete(remote)}
                              disabled={isLoading || busyHref === remote.pulp_href}
                            >
                              Delete
                            </Button>
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
              disabled={isLoadingRemotes}
            />
          </CardContent>
        </Card>
      )}

      {modalOpen ? (
        <RemoteFormModal
          kind={kind}
          editing={editing}
          onClose={closeModal}
          onSaved={() => {
            closeModal();
            void load();
          }}
          onBusyChange={setIsSaving}
        />
      ) : null}

      {labelsTarget ? (
        <LabelEditorModal
          pulpHref={labelsTarget.pulp_href}
          resourceName={labelsTarget.name}
          labels={labelsTarget.pulp_labels}
          onClose={() => setLabelsTarget(null)}
          onSaved={() => {
            setLabelsTarget(null);
            void load();
          }}
        />
      ) : null}

      {accessTarget ? (
        <AccessPanelModal
          pulpHref={accessTarget.pulp_href}
          resourceName={accessTarget.name}
          onClose={() => setAccessTarget(null)}
        />
      ) : null}
    </AdminShell>
  );
}

function RemotesListSuspenseFallback() {
  const { sessionUser, isLoading, hasSession, error, logout } = usePulpAuthContext();
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);

  return (
    <AdminShell
      title="Remotes"
      description="Remotes describe an upstream repository to sync content from. Create, edit, or remove remotes here, then sync a repository against one."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      <Card>Loading remote list…</Card>
    </AdminShell>
  );
}

export default function RemotesListPage() {
  return (
    <Suspense fallback={<RemotesListSuspenseFallback />}>
      <RemotesListPageContent />
    </Suspense>
  );
}
