"use client";

import { Suspense, useMemo, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpGroups } from "@/components/pulp/use-pulp-groups";
import { usePulpPublications } from "@/components/pulp/use-pulp-publications";
import { usePulpRepositoryOptions } from "@/components/pulp/use-pulp-repository-options";
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
import { ListPagination } from "@/components/pulp/list-pagination";
import { ListQueryBar, SortableColumnHeader } from "@/components/pulp/list-query-bar";
import { usePulpListQuery } from "@/components/pulp/use-pulp-list-query";
import { PULP_PLUGINS, getPulpPlugin, type PulpPluginKind } from "@/lib/pulp-plugins";

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

/** GET /publications/ has no `name`/`pulp_label_select` filters and no `type` field on its rows, so
 * type is derived from the href (which embeds the plugin path, e.g. /publications/rpm/rpm/<id>/)
 * and the `pulp_type` filter value is looked up here rather than added to PULP_PLUGINS. */
const PULP_TYPE_BY_KIND: Partial<Record<PulpPluginKind, string>> = {
  rpm: "rpm.rpm",
  deb: "deb.apt-publication",
  file: "file.file",
  python: "python.python",
  gem: "gem.gem",
};

function publicationKindFromHref(href: string): PulpPluginKind | null {
  for (const plugin of PULP_PLUGINS) {
    if (plugin.publicationPath && href.includes(plugin.publicationPath)) {
      return plugin.kind;
    }
  }
  return null;
}

function PublicationsListPageContent() {
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);
  const { query, params, setOrdering, setPage, setPageSize, setQ } = usePulpListQuery();
  const { repositoryOptions } = usePulpRepositoryOptions(hasSession);
  const [repositoryFilter, setRepositoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const requestParams = useMemo(() => {
    const next = new URLSearchParams(params);
    if (repositoryFilter) {
      next.set("repository", repositoryFilter);
    }
    if (typeFilter) {
      next.set("pulp_type", typeFilter);
    }
    return next;
  }, [params, repositoryFilter, typeFilter]);
  const { publications, count, deletePublication } = usePulpPublications(hasSession, requestParams);

  const repositoryNameByHref = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of repositoryOptions) {
      map.set(option.href, option.name);
    }
    return map;
  }, [repositoryOptions]);

  const totalPages = Math.max(1, Math.ceil(count / query.pageSize));

  function handleRepositoryFilterChange(value: string) {
    setRepositoryFilter(value);
    setPage(1);
  }

  function handleTypeFilterChange(value: string) {
    setTypeFilter(value);
    setPage(1);
  }

  async function removePublication(href: string) {
    if (!window.confirm("Delete this publication?")) {
      return;
    }

    await deletePublication(href);
  }

  return (
    <AdminShell
      title="Publications List"
      description="Browse publications from your connected Pulp server."
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
            Publications
            {count > 0 ? (
              <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
                ({count.toLocaleString()} total)
              </span>
            ) : null}
          </CardTitle>
          <CardContent className="space-y-4">
            <ListQueryBar
              search={query.search}
              onSearchChange={() => {}}
              pageSize={query.pageSize}
              onPageSizeChange={setPageSize}
              disabled={isLoading}
              showSearch={false}
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
              <FormField label="Type">
                <select
                  value={typeFilter}
                  onChange={(event) => handleTypeFilterChange(event.target.value)}
                  disabled={isLoading}
                  className={selectClassName}
                >
                  <option value="">All types</option>
                  {PULP_PLUGINS.filter((plugin) => PULP_TYPE_BY_KIND[plugin.kind]).map((plugin) => (
                    <option key={plugin.kind} value={PULP_TYPE_BY_KIND[plugin.kind]}>
                      {plugin.label}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <TableWrapper>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Repository</TableHeaderCell>
                    <TableHeaderCell>Repository version</TableHeaderCell>
                    <TableHeaderCell>Type</TableHeaderCell>
                    <TableHeaderCell>
                      <SortableColumnHeader
                        label="Created"
                        field="pulp_created"
                        ordering={query.ordering}
                        onSort={setOrdering}
                      />
                    </TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {publications.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-zinc-500">
                        No publications found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    publications.map((publication) => {
                      const kind = publicationKindFromHref(publication.pulp_href);
                      const repositoryName = publication.repository
                        ? repositoryNameByHref.get(publication.repository) ?? publication.repository
                        : "-";
                      return (
                        <TableRow key={publication.pulp_href}>
                          <TableCell className="font-mono text-xs">{repositoryName}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {publication.repository_version}
                          </TableCell>
                          <TableCell>{kind ? getPulpPlugin(kind).label : "Unknown"}</TableCell>
                          <TableCell>{publication.pulp_created}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                                onClick={() => removePublication(publication.pulp_href)}
                                disabled={isLoading}
                              >
                                Delete
                              </Button>
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

function PublicationsListSuspenseFallback() {
  const { sessionUser, isLoading, hasSession, error, logout } = usePulpAuthContext();
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);

  return (
    <AdminShell
      title="Publications List"
      description="Browse publications from your connected Pulp server."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      <Card>Loading publication list…</Card>
    </AdminShell>
  );
}

export default function PublicationsListPage() {
  return (
    <Suspense fallback={<PublicationsListSuspenseFallback />}>
      <PublicationsListPageContent />
    </Suspense>
  );
}
