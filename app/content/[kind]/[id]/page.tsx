"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
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
import { formatBytes } from "@/lib/format-bytes";
import { findPulpPlugin, isPulpPluginKind } from "@/lib/pulp-plugins";
import { pulpContentService } from "@/services/pulp/content-service";

function fieldLabel(key: string): string {
  return key
    .split("_")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function scalarValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/** Objects/arrays are never dumped as JSON; a count is the only sensible summary. */
function collectionValue(value: unknown[] | Record<string, unknown>): string {
  const size = Array.isArray(value) ? value.length : Object.keys(value).length;
  return size === 0 ? "empty" : `${size} ${size === 1 ? "entry" : "entries"}`;
}

export default function ContentUnitDetailPage() {
  const params = useParams<{ kind: string; id: string }>();
  const kindParam = params?.kind ?? "";
  const id = params?.id ?? "";
  const kind = isPulpPluginKind(kindParam) ? kindParam : null;
  const plugin = kind ? findPulpPlugin(kind) : null;

  const { sessionUser, isLoading, isCheckingSession, hasSession, error, setError, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);

  const [unit, setUnit] = useState<Record<string, unknown> | null>(null);
  const [isLoadingUnit, setIsLoadingUnit] = useState(false);

  const load = useCallback(async () => {
    if (!hasSession || !kind || !id) {
      setUnit(null);
      return;
    }
    setIsLoadingUnit(true);
    setError(null);
    try {
      const data = await pulpContentService.getContentUnit(kind, id);
      setUnit(data);
    } catch (e) {
      setUnit(null);
      setError(e instanceof Error ? e.message : "Failed to load content unit.");
    } finally {
      setIsLoadingUnit(false);
    }
  }, [hasSession, kind, id, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const shownKeys = new Set<string>(["pulp_href", "artifact"]);
  if (plugin) {
    for (const field of plugin.contentFields) {
      shownKeys.add(field.name);
    }
    if (plugin.contentSizeField) {
      shownKeys.add(plugin.contentSizeField);
    }
  }
  const otherFields = unit
    ? Object.entries(unit).filter(([key]) => !shownKeys.has(key))
    : [];

  const artifactHref = unit && typeof unit.artifact === "string" ? unit.artifact : null;
  const pulpHref = unit && typeof unit.pulp_href === "string" ? unit.pulp_href : null;

  return (
    <AdminShell
      title={plugin ? `${plugin.label} content` : "Content detail"}
      description="Single Pulp content unit: type-specific fields plus everything else the server returned."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading || isLoadingUnit}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      {isCheckingSession || isRedirectingToLogin ? (
        <Card>Checking existing session...</Card>
      ) : !plugin ? (
        <Card>Unknown content kind &quot;{kindParam}&quot;.</Card>
      ) : !unit && !isLoadingUnit ? (
        <Card>Content unit not found or could not be loaded.</Card>
      ) : unit ? (
        <div className="space-y-4">
          <Card>
            <CardTitle>{id}</CardTitle>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                {plugin.contentFields.map((field) => (
                  <div key={field.name}>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      {field.label}
                    </p>
                    <p className="break-all">{scalarValue(unit[field.name])}</p>
                  </div>
                ))}
                {plugin.contentSizeField ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Size</p>
                    <p>{formatBytes(unit[plugin.contentSizeField])}</p>
                  </div>
                ) : null}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">pulp_href</p>
                <p className="break-all font-mono text-xs">{pulpHref ?? "-"}</p>
              </div>
              {artifactHref ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Artifact</p>
                  <a
                    href={artifactHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {artifactHref}
                  </a>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardTitle>Other fields</CardTitle>
            <CardContent>
              {otherFields.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No other fields.</p>
              ) : (
                <TableWrapper>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Field</TableHeaderCell>
                        <TableHeaderCell>Value</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {otherFields.map(([key, value]) => (
                        <TableRow key={key}>
                          <TableCell className="text-sm">{fieldLabel(key)}</TableCell>
                          <TableCell className="max-w-md truncate text-sm">
                            {value !== null && typeof value === "object"
                              ? collectionValue(value as Record<string, unknown>)
                              : scalarValue(value)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableWrapper>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>Loading…</Card>
      )}
    </AdminShell>
  );
}
