"use client";

import Link from "next/link";
import { Suspense } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { extractRpmPackageContentId } from "@/lib/extract-rpm-package-content-id";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpContent } from "@/components/pulp/use-pulp-content";
import { usePulpGroups } from "@/components/pulp/use-pulp-groups";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { usePulpUsers } from "@/components/pulp/use-pulp-users";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
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

const PAGE_SIZE = 50;

function ContentListPageContent() {
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);
  const { query, params, setPage, setPageSize, setQ } = usePulpListQuery({ pageSize: PAGE_SIZE });
  const { contentItems, count, loading } = usePulpContent(hasSession, params);

  const totalPages = Math.max(1, Math.ceil(count / query.pageSize));

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
