"use client";

import { Suspense, useMemo, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpContentGuards } from "@/components/pulp/use-pulp-content-guards";
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
import { ContentGuardCreateModal } from "@/components/pulp/content-guard-create-modal";
import { ContentGuardEditModal } from "@/components/pulp/content-guard-edit-modal";
import { ListPagination } from "@/components/pulp/list-pagination";
import { ListQueryBar, SortableColumnHeader } from "@/components/pulp/list-query-bar";
import { usePulpListQuery } from "@/components/pulp/use-pulp-list-query";
import {
  findPulpContentGuardKind,
  pulpContentGuardKindFromHref,
  PULP_CONTENT_GUARD_KINDS,
} from "@/services/pulp/content-guard-kinds";
import { PulpContentGuard } from "@/services/pulp/types";

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

function contentGuardTypeLabel(href: string): string {
  const kind = pulpContentGuardKindFromHref(href);
  if (!kind) {
    return "Unknown";
  }
  return findPulpContentGuardKind(kind)?.label ?? kind;
}

function ContentGuardsListPageContent() {
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);
  const { query, params, setSearch, setOrdering, setPage, setPageSize, setQ } =
    usePulpListQuery();
  const [typeFilter, setTypeFilter] = useState("");
  const requestParams = useMemo(() => {
    const next = new URLSearchParams(params);
    if (typeFilter) {
      next.set("pulp_type", typeFilter);
    }
    return next;
  }, [params, typeFilter]);
  const { contentGuards, count, deleteContentGuard, refreshContentGuards } =
    usePulpContentGuards(hasSession, requestParams);
  const [editTarget, setEditTarget] = useState<PulpContentGuard | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [accessTarget, setAccessTarget] = useState<PulpContentGuard | null>(null);

  const totalPages = Math.max(1, Math.ceil(count / query.pageSize));

  function handleTypeFilterChange(value: string) {
    setTypeFilter(value);
    setPage(1);
  }

  async function removeContentGuard(href: string) {
    if (!window.confirm("Delete this content guard?")) {
      return;
    }

    await deleteContentGuard(href);
  }

  return (
    <AdminShell
      title="Content Guards List"
      description="Control who may download content through your connected Pulp server."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      {isCheckingSession || isRedirectingToLogin ? (
        <Card>Checking existing session...</Card>
      ) : (
        <Card>
          <CardTitle>
            Content guards
            {count > 0 ? (
              <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
                ({count.toLocaleString()} total)
              </span>
            ) : null}
          </CardTitle>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(true)}>
                New content guard
              </Button>
            </div>
            <ListQueryBar
              search={query.search}
              onSearchChange={setSearch}
              pageSize={query.pageSize}
              onPageSizeChange={setPageSize}
              disabled={isLoading}
              q={query.q}
              onQChange={setQ}
            />
            <div className="flex flex-wrap items-end gap-3">
              <FormField label="Type">
                <select
                  value={typeFilter}
                  onChange={(event) => handleTypeFilterChange(event.target.value)}
                  disabled={isLoading}
                  className={selectClassName}
                >
                  <option value="">All types</option>
                  {PULP_CONTENT_GUARD_KINDS.map((descriptor) => (
                    <option key={descriptor.kind} value={descriptor.kind}>
                      {descriptor.label}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
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
                    <TableHeaderCell>Type</TableHeaderCell>
                    <TableHeaderCell>Description</TableHeaderCell>
                    <TableHeaderCell>Created</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {contentGuards.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-zinc-500">
                        No content guards found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    contentGuards.map((contentGuard) => (
                      <TableRow key={contentGuard.pulp_href}>
                        <TableCell className="font-medium">{contentGuard.name}</TableCell>
                        <TableCell>{contentGuardTypeLabel(contentGuard.pulp_href)}</TableCell>
                        <TableCell>{contentGuard.description ?? "-"}</TableCell>
                        <TableCell>{contentGuard.pulp_created}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setEditTarget(contentGuard)}
                              disabled={isLoading}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setAccessTarget(contentGuard)}
                              disabled={isLoading}
                            >
                              Access
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                              onClick={() => removeContentGuard(contentGuard.pulp_href)}
                              disabled={isLoading}
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
              disabled={isLoading}
            />
          </CardContent>
        </Card>
      )}

      {editTarget ? (
        <ContentGuardEditModal
          contentGuard={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            void refreshContentGuards();
          }}
        />
      ) : null}

      {isCreateOpen ? (
        <ContentGuardCreateModal
          onClose={() => setIsCreateOpen(false)}
          onCreated={() => {
            setIsCreateOpen(false);
            void refreshContentGuards();
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

function ContentGuardsListSuspenseFallback() {
  const { sessionUser, isLoading, hasSession, error, logout } = usePulpAuthContext();
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);

  return (
    <AdminShell
      title="Content Guards List"
      description="Control who may download content through your connected Pulp server."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      <Card>Loading content guard list…</Card>
    </AdminShell>
  );
}

export default function ContentGuardsListPage() {
  return (
    <Suspense fallback={<ContentGuardsListSuspenseFallback />}>
      <ContentGuardsListPageContent />
    </Suspense>
  );
}
