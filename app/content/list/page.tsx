"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { extractRpmPackageContentId } from "@/lib/extract-rpm-package-content-id";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpContent } from "@/components/pulp/use-pulp-content";
import { usePulpGroups } from "@/components/pulp/use-pulp-groups";
import { usePulpRepositoryOptions } from "@/components/pulp/use-pulp-repository-options";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { usePulpUsers } from "@/components/pulp/use-pulp-users";
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
import { ListQueryBar } from "@/components/pulp/list-query-bar";
import { usePulpListQuery } from "@/components/pulp/use-pulp-list-query";
import { PULP_PLUGINS, findContentForHref, getPulpPlugin } from "@/lib/pulp-plugins";

const PAGE_SIZE = 50;

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

function ContentListPageContent() {
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);
  const { query, params, setPage, setPageSize, setQ } = usePulpListQuery({ pageSize: PAGE_SIZE });
  const { repositoryOptions } = usePulpRepositoryOptions(hasSession);
  const [repositoryFilter, setRepositoryFilter] = useState("");
  const [contentTypeFilter, setContentTypeFilter] = useState("");
  const requestParams = useMemo(() => {
    const next = new URLSearchParams(params);
    if (repositoryFilter) {
      next.set("repository_version", repositoryFilter);
    }
    if (contentTypeFilter) {
      next.set("pulp_type", contentTypeFilter);
    }
    return next;
  }, [params, repositoryFilter, contentTypeFilter]);
  const { contentItems, count, loading } = usePulpContent(hasSession, requestParams);

  const totalPages = Math.max(1, Math.ceil(count / query.pageSize));

  function handleRepositoryFilterChange(value: string) {
    setRepositoryFilter(value);
    setPage(1);
  }

  function handleContentTypeFilterChange(value: string) {
    setContentTypeFilter(value);
    setPage(1);
  }

  return (
    <AdminShell
      title="Content List"
      description="View all content records from your connected Pulp server."
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
            Content
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
              disabled={loading}
              showSearch={false}
              q={query.q}
              onQChange={setQ}
            />
            <div className="flex flex-wrap items-end gap-3">
              <FormField label="Repository">
                <select
                  value={repositoryFilter}
                  onChange={(event) => handleRepositoryFilterChange(event.target.value)}
                  disabled={loading}
                  className={selectClassName}
                >
                  <option value="">All repositories</option>
                  {repositoryOptions
                    /* Repositories that have never been synced have no latest_version_href
                       to filter content by, so they cannot be offered here. */
                    .filter((option) => option.latestVersionHref !== null)
                    .map((option) => (
                      <option key={option.href} value={option.latestVersionHref ?? undefined}>
                        {option.name} ({getPulpPlugin(option.kind).label})
                      </option>
                    ))}
                </select>
              </FormField>
              <FormField label="Content Type">
                <select
                  value={contentTypeFilter}
                  onChange={(event) => handleContentTypeFilterChange(event.target.value)}
                  disabled={loading}
                  className={selectClassName}
                >
                  <option value="">All content types</option>
                  {PULP_PLUGINS.map((plugin) => (
                    <option key={plugin.kind} value={plugin.contentType}>
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
                    <TableHeaderCell>Pulp Href</TableHeaderCell>
                    <TableHeaderCell>Created</TableHeaderCell>
                    <TableHeaderCell>Artifact Names</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && contentItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-zinc-500">
                        Loading content…
                      </TableCell>
                    </TableRow>
                  ) : !loading && contentItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-zinc-500">
                        No content on this page.
                      </TableCell>
                    </TableRow>
                  ) : (
                    contentItems.map((item) => {
                      const rpmPackageId = extractRpmPackageContentId(item.pulp_href);
                      const contentMatch = rpmPackageId ? null : findContentForHref(item.pulp_href);
                      return (
                        <TableRow key={item.pulp_href}>
                          <TableCell className="font-mono text-xs">{item.pulp_href}</TableCell>
                          <TableCell>{item.pulp_created}</TableCell>
                          <TableCell className="text-xs">
                            {Object.keys(item.artifacts).join(", ") || "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {rpmPackageId ? (
                              <Link
                                href={`/content/packages/${rpmPackageId}`}
                                className="inline-flex rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                              >
                                View package
                              </Link>
                            ) : contentMatch ? (
                              <Link
                                href={`/content/${contentMatch.kind}/${contentMatch.id}`}
                                className="inline-flex rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                              >
                                View content
                              </Link>
                            ) : (
                              <span className="text-xs text-zinc-500">-</span>
                            )}
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
              disabled={loading}
            />
          </CardContent>
        </Card>
      )}
    </AdminShell>
  );
}

function ContentListSuspenseFallback() {
  const { sessionUser, isLoading, hasSession, error, logout } = usePulpAuthContext();
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);

  return (
    <AdminShell
      title="Content List"
      description="View all content records from your connected Pulp server."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      <Card>Loading content list…</Card>
    </AdminShell>
  );
}

export default function ContentListPage() {
  return (
    <Suspense fallback={<ContentListSuspenseFallback />}>
      <ContentListPageContent />
    </Suspense>
  );
}
