"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpGroups } from "@/components/pulp/use-pulp-groups";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { usePulpUsers } from "@/components/pulp/use-pulp-users";
import { Badge } from "@/components/ui/badge";
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
import { pulpStatusService } from "@/services/pulp/status-service";
import type { PulpStatus, PulpStatusApp } from "@/services/pulp/types";

function formatIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString();
}

function formatBytes(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function ConnectionBadge({ connection }: { connection: { connected: boolean } | null }) {
  if (connection === null) {
    return <Badge variant="outline">not reported</Badge>;
  }
  return (
    <Badge variant={connection.connected ? "success" : "destructive"}>
      {connection.connected ? "connected" : "not connected"}
    </Badge>
  );
}

function AppTable({ apps, emptyLabel }: { apps: PulpStatusApp[]; emptyLabel: string }) {
  return (
    <TableWrapper>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Name</TableHeaderCell>
            <TableHeaderCell>Last heartbeat</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {apps.length === 0 ? (
            <TableRow>
              <TableCell colSpan={2} className="text-zinc-500">
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            apps.map((app) => (
              <TableRow key={app.name}>
                <TableCell className="font-mono text-xs">{app.name}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {formatIso(app.last_heartbeat)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableWrapper>
  );
}

export default function StatusPage() {
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, setError, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);

  const [status, setStatus] = useState<PulpStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  const load = useCallback(async () => {
    if (!hasSession) {
      setStatus(null);
      return;
    }
    setIsLoadingStatus(true);
    setError(null);
    try {
      const data = await pulpStatusService.get();
      setStatus(data);
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : "Failed to load server status.");
    } finally {
      setIsLoadingStatus(false);
    }
  }, [hasSession, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminShell
      title="Server status"
      description="Pulp component versions, online services, connectivity, and storage."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading || isLoadingStatus}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      {isCheckingSession || isRedirectingToLogin ? (
        <Card>Checking existing session...</Card>
      ) : !status && !isLoadingStatus ? (
        <Card>Status could not be loaded.</Card>
      ) : status ? (
        <div className="space-y-4">
          <Card>
            <CardTitle>Health</CardTitle>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Database
                </span>
                <ConnectionBadge connection={status.database_connection} />
                <span className="ml-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Redis
                </span>
                <ConnectionBadge connection={status.redis_connection} />
                <span className="ml-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Domains
                </span>
                <Badge variant={status.domain_enabled ? "success" : "outline"}>
                  {status.domain_enabled ? "enabled" : "disabled"}
                </Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Workers online
                  </p>
                  <p>{status.online_workers.length}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    API apps online
                  </p>
                  <p>{status.online_api_apps.length}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Content apps online
                  </p>
                  <p>{status.online_content_apps.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardTitle>Storage</CardTitle>
            <CardContent className="text-sm">
              {status.storage === null ? (
                <p className="text-zinc-500 dark:text-zinc-400">
                  Storage totals are not reported by this deployment.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total</p>
                    <p>{formatBytes(status.storage.total)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Used</p>
                    <p>{formatBytes(status.storage.used)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Free</p>
                    <p>{formatBytes(status.storage.free)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardTitle>Content settings</CardTitle>
            <CardContent className="space-y-3 text-sm">
              {status.content_settings === null ? (
                <p className="text-zinc-500 dark:text-zinc-400">
                  Content settings are not reported by this deployment.
                </p>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Content origin
                    </p>
                    <p className="break-all font-mono text-xs">
                      {status.content_settings.content_origin ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Content path prefix
                    </p>
                    <p className="break-all font-mono text-xs">
                      {status.content_settings.content_path_prefix}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardTitle>Installed components ({status.versions.length})</CardTitle>
            <CardContent>
              <TableWrapper>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Component</TableHeaderCell>
                      <TableHeaderCell>Version</TableHeaderCell>
                      <TableHeaderCell>Package</TableHeaderCell>
                      <TableHeaderCell>Module</TableHeaderCell>
                      <TableHeaderCell>Domain compatible</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {status.versions.map((version) => (
                      <TableRow key={version.component}>
                        <TableCell className="font-medium">{version.component}</TableCell>
                        <TableCell className="font-mono text-xs">{version.version}</TableCell>
                        <TableCell className="font-mono text-xs">{version.package}</TableCell>
                        <TableCell className="font-mono text-xs">{version.module}</TableCell>
                        <TableCell>{version.domain_compatible ? "yes" : "no"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>
            </CardContent>
          </Card>

          <Card>
            <CardTitle>Online workers ({status.online_workers.length})</CardTitle>
            <CardContent>
              <AppTable apps={status.online_workers} emptyLabel="No workers online." />
            </CardContent>
          </Card>

          <Card>
            <CardTitle>Online API apps ({status.online_api_apps.length})</CardTitle>
            <CardContent>
              <AppTable apps={status.online_api_apps} emptyLabel="No API apps online." />
            </CardContent>
          </Card>

          <Card>
            <CardTitle>Online content apps ({status.online_content_apps.length})</CardTitle>
            <CardContent>
              <AppTable apps={status.online_content_apps} emptyLabel="No content apps online." />
            </CardContent>
          </Card>

          <div>
            <Button
              type="button"
              variant="outline"
              disabled={isLoadingStatus}
              onClick={() => void load()}
            >
              Refresh
            </Button>
          </div>
        </div>
      ) : (
        <Card>Loading…</Card>
      )}
    </AdminShell>
  );
}
