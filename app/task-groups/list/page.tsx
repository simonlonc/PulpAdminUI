"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpGroups } from "@/components/pulp/use-pulp-groups";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { usePulpUsers } from "@/components/pulp/use-pulp-users";
import { Button } from "@/components/ui/button";
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
import { pulpTaskGroupService } from "@/services/pulp/task-group-service";
import type { PulpTaskGroup } from "@/services/pulp/types";

const PAGE_SIZE = 100;

export default function TaskGroupsListPage() {
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, setError, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);

  const [items, setItems] = useState<PulpTaskGroup[]>([]);
  const [count, setCount] = useState(0);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);

  const load = useCallback(async () => {
    if (!hasSession) return;
    setIsLoadingGroups(true);
    setError(null);
    try {
      const page = await pulpTaskGroupService.list({ limit: PAGE_SIZE, offset: 0 });
      setItems(page.results);
      setCount(page.count);
    } catch (e) {
      setItems([]);
      setCount(0);
      setError(e instanceof Error ? e.message : "Failed to load task groups.");
    } finally {
      setIsLoadingGroups(false);
    }
  }, [hasSession, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminShell
      title="Task groups"
      description="Groups of related Pulp tasks dispatched together."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading || isLoadingGroups}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      {isCheckingSession || isRedirectingToLogin ? (
        <Card>Checking existing session...</Card>
      ) : (
        <Card>
          <CardTitle>Task groups ({count})</CardTitle>
          <CardContent className="space-y-4">
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={isLoadingGroups}
                onClick={() => void load()}
              >
                Refresh
              </Button>
            </div>

            <TableWrapper>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Description</TableHeaderCell>
                    <TableHeaderCell>Dispatched</TableHeaderCell>
                    <TableHeaderCell>Waiting</TableHeaderCell>
                    <TableHeaderCell>Running</TableHeaderCell>
                    <TableHeaderCell>Completed</TableHeaderCell>
                    <TableHeaderCell>Failed</TableHeaderCell>
                    <TableHeaderCell>Canceled</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {isLoadingGroups && items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-zinc-500">
                        Loading task groups…
                      </TableCell>
                    </TableRow>
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-zinc-500">
                        No task groups returned.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((group) => (
                      <TableRow key={group.pulp_href}>
                        <TableCell className="max-w-[22rem] truncate" title={group.description}>
                          {group.description}
                        </TableCell>
                        <TableCell>{group.all_tasks_dispatched ? "yes" : "no"}</TableCell>
                        <TableCell>{group.waiting}</TableCell>
                        <TableCell>{group.running}</TableCell>
                        <TableCell>{group.completed}</TableCell>
                        <TableCell>{group.failed}</TableCell>
                        <TableCell>{group.canceled}</TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/task-groups/detail?pulp_href=${encodeURIComponent(group.pulp_href)}`}
                            className="inline-flex rounded-md border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                          >
                            Details
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableWrapper>
          </CardContent>
        </Card>
      )}
    </AdminShell>
  );
}
