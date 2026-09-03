"use client";

import { Suspense, useMemo, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpDistributions } from "@/components/pulp/use-pulp-distributions";
import { usePulpGroups } from "@/components/pulp/use-pulp-groups";
import { usePulpRepositoryOptions } from "@/components/pulp/use-pulp-repository-options";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { usePulpUsers } from "@/components/pulp/use-pulp-users";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";
import { ListPagination } from "@/components/pulp/list-pagination";
import { ListQueryBar, SortableColumnHeader } from "@/components/pulp/list-query-bar";
import { usePulpListQuery } from "@/components/pulp/use-pulp-list-query";
import { getPulpPlugin } from "@/lib/pulp-plugins";

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

function resolveDistributionUrl(raw: string): string {
  const hrefMatch = raw.match(/href="([^"]+)"/i);
  if (hrefMatch?.[1]) {
    return hrefMatch[1];
  }

  return raw;
}

function DistributionsListPageContent() {
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);
  const { query, params, setSearch, setOrdering, setPage, setPageSize, setQ } = usePulpListQuery();
  const { repositoryOptions } = usePulpRepositoryOptions(hasSession);
  const [repositoryFilter, setRepositoryFilter] = useState("");
  const requestParams = useMemo(() => {
    const next = new URLSearchParams(params);
    if (repositoryFilter) {
      next.set("repository", repositoryFilter);
    }
    return next;
  }, [params, repositoryFilter]);
  const { distributions, count, updateDistribution, deleteDistribution } = usePulpDistributions(
    hasSession,
    requestParams
  );
  const [editingHref, setEditingHref] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBasePath, setEditBasePath] = useState("");

  const totalPages = Math.max(1, Math.ceil(count / query.pageSize));

  function handleRepositoryFilterChange(value: string) {
    setRepositoryFilter(value);
    setPage(1);
  }

  function startEdit(href: string, name: string, basePath: string) {
    setEditingHref(href);
    setEditName(name);
    setEditBasePath(basePath);
  }

  function cancelEdit() {
    setEditingHref(null);
  }

  async function saveDistribution(href: string) {
    const success = await updateDistribution(href, {
      name: editName,
      base_path: editBasePath,
    });

    if (success) {
      setEditingHref(null);
    }
  }

  async function removeDistribution(href: string) {
    if (!window.confirm("Delete this distribution?")) {
      return;
    }

    await deleteDistribution(href);
  }

  return (
    <AdminShell
      title="Distributions List"
      description="View published distributions from your connected Pulp server."
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
            Distributions
            {count > 0 ? (
              <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
                ({count.toLocaleString()} total)
              </span>
            ) : null}
          </CardTitle>
          <CardContent className="space-y-4">
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
              <FormField label="Repository">
                <select
                  value={repositoryFilter}
                  onChange={(event) => handleRepositoryFilterChange(event.target.value)}
                  disabled={isLoading}
                  className={selectClassName}
                >
                  <option value="">All repositories</option>
                  {repositoryOptions.map((option) => (
                    <option key={option.href} value={option.href}>
                      {option.name} ({getPulpPlugin(option.kind).label})
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
                    <TableHeaderCell>Base Path</TableHeaderCell>
                    <TableHeaderCell>Base URL</TableHeaderCell>
                    <TableHeaderCell>Created</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {distributions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-zinc-500">
                        No distributions found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    distributions.map((distribution) => {
                      const url = resolveDistributionUrl(distribution.base_url);
                      const isEditing = editingHref === distribution.pulp_href;
                      return (
                        <TableRow key={distribution.pulp_href}>
                          <TableCell className="font-medium">
                            {isEditing ? (
                              <Input
                                value={editName}
                                onChange={(event) => setEditName(event.target.value)}
                              />
                            ) : (
                              distribution.name
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Input
                                value={editBasePath}
                                onChange={(event) => setEditBasePath(event.target.value)}
                              />
                            ) : (
                              distribution.base_path
                            )}
                          </TableCell>
                          <TableCell>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline dark:text-blue-400"
                            >
                              {url}
                            </a>
                          </TableCell>
                          <TableCell>{distribution.pulp_created}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {isEditing ? (
                                <>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={cancelEdit}
                                    disabled={isLoading}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    type="button"
                                    onClick={() => saveDistribution(distribution.pulp_href)}
                                    disabled={isLoading}
                                  >
                                    Save
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                      startEdit(
                                        distribution.pulp_href,
                                        distribution.name,
                                        distribution.base_path
                                      )
                                    }
                                    disabled={isLoading}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                                    onClick={() => removeDistribution(distribution.pulp_href)}
                                    disabled={isLoading}
                                  >
                                    Delete
                                  </Button>
                                </>
                              )}
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
    </AdminShell>
  );
}

function DistributionsListSuspenseFallback() {
  const { sessionUser, isLoading, hasSession, error, logout } = usePulpAuthContext();
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);

  return (
    <AdminShell
      title="Distributions List"
      description="View published distributions from your connected Pulp server."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      <Card>Loading distribution list…</Card>
    </AdminShell>
  );
}

export default function DistributionsListPage() {
  return (
    <Suspense fallback={<DistributionsListSuspenseFallback />}>
      <DistributionsListPageContent />
    </Suspense>
  );
}
