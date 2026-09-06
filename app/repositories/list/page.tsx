"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpPluginsContext } from "@/components/pulp/plugins-context";
import { usePulpGroups } from "@/components/pulp/use-pulp-groups";
import { usePulpObjectPermissions } from "@/components/pulp/use-pulp-object-permissions";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { usePulpUsers } from "@/components/pulp/use-pulp-users";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  GitBranch,
  MoreVertical,
  Package,
  Pencil,
  RefreshCw,
  Share2,
  ShieldCheck,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";
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
import { RepositoryCreateModal } from "@/components/pulp/repository-create-modal";
import { RepositoryDeleteModal } from "@/components/pulp/repository-delete-modal";
import { RepositorySyncModal } from "@/components/pulp/repository-sync-modal";
import { usePulpListQuery } from "@/components/pulp/use-pulp-list-query";
import { buildPulpListParams } from "@/lib/pulp-list-query";
import { pulpDistributionService } from "@/services/pulp/distribution-service";
import { type PulpPluginKind } from "@/lib/pulp-plugins";
import { pulpRemoteService } from "@/services/pulp/remote-service";
import { pulpRepositoryManagementService } from "@/services/pulp/repository-management-service";
import { PulpDistribution, PulpRemote, PulpRepository } from "@/services/pulp/types";

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

function distributionUrlByRepositoryHref(distributions: PulpDistribution[]): Record<string, string> {
  const sorted = [...distributions].sort((a, b) => a.name.localeCompare(b.name));
  const map: Record<string, string> = {};
  for (const d of sorted) {
    if (d.repository && d.base_url && map[d.repository] === undefined) {
      map[d.repository] = d.base_url;
    }
  }
  return map;
}

function RepositoriesListPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { sessionUser, isLoading, isCheckingSession, hasSession, error, setError, logout } =
    usePulpAuthContext();
  const { plugins, getPlugin } = usePulpPluginsContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);
  const { query, setSearch, setOrdering, setPage, setPageSize, setQ, setLabelSelect } =
    usePulpListQuery();
  const { ensure: ensurePermissions, can: canOnRepo } = usePulpObjectPermissions();

  const [kind, setKind] = useState<PulpPluginKind>("rpm");
  const [remoteFilter, setRemoteFilter] = useState("");
  const [items, setItems] = useState<PulpRepository[]>([]);
  const [count, setCount] = useState(0);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [distributions, setDistributions] = useState<PulpDistribution[]>([]);
  const [distributionUrlByRepo, setDistributionUrlByRepo] = useState<Record<string, string>>({});
  const [busyHref, setBusyHref] = useState<string | null>(null);
  const [deleteModalRepo, setDeleteModalRepo] = useState<PulpRepository | null>(null);
  const [labelsTarget, setLabelsTarget] = useState<PulpRepository | null>(null);
  const [accessTarget, setAccessTarget] = useState<PulpRepository | null>(null);
  const [publishResult, setPublishResult] = useState<{
    repoName: string;
    publication: string | null;
    task: string | null;
  } | null>(null);
  const [distributeResult, setDistributeResult] = useState<{
    repoName: string;
    name: string;
    pulp_href: string | null;
    base_url: string | null;
    base_path: string;
    task: string | null;
  } | null>(null);

  const [syncModalRepo, setSyncModalRepo] = useState<PulpRepository | null>(null);
  // Filled in per kind as remotes load. The registry is derived from the server, so a kind
  // this map has not reached yet reads as an empty list rather than undefined.
  const [remotesByKind, setRemotesByKind] = useState<Record<PulpPluginKind, PulpRemote[]>>({});
  const [syncResult, setSyncResult] = useState<{ repoName: string; task: string | null } | null>(
    null
  );

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!hasSession) return;
    setIsLoadingRepos(true);
    setError(null);
    try {
      const listParams = buildPulpListParams(query);
      if (remoteFilter) {
        listParams.set("remote", remoteFilter);
      }
      const page = await pulpRepositoryManagementService.list(kind, listParams);
      setItems(page.results);
      setCount(page.count);
      try {
        const distPage = await pulpDistributionService.list(new URLSearchParams({ limit: "1000" }));
        setDistributions(distPage.results);
        setDistributionUrlByRepo(distributionUrlByRepositoryHref(distPage.results));
      } catch {
        setDistributions([]);
        setDistributionUrlByRepo({});
      }
    } catch (e) {
      setItems([]);
      setCount(0);
      setDistributions([]);
      setDistributionUrlByRepo({});
      setError(e instanceof Error ? e.message : "Failed to load repositories.");
    } finally {
      setIsLoadingRepos(false);
    }
  }, [hasSession, kind, query, remoteFilter, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!hasSession) return;
    void (async () => {
      try {
        const remotes = await pulpRemoteService.list(kind);
        setRemotesByKind((prev) => ({ ...prev, [kind]: remotes.results }));
      } catch {
        // Leave remotes empty; "All remotes" still works.
      }
    })();
  }, [hasSession, kind]);

  function handleRemoteFilterChange(value: string) {
    setRemoteFilter(value);
    setPage(1);
  }

  useEffect(() => {
    if (searchParams.get("create") !== "1") return;
    setCreateModalOpen(true);
    router.replace("/repositories/list", { scroll: false });
  }, [searchParams, router]);

  function openCreateModal() {
    setError(null);
    setCreateModalOpen(true);
  }

  async function handlePublish(repo: PulpRepository) {
    setBusyHref(repo.pulp_href);
    setError(null);
    setPublishResult(null);
    setDistributeResult(null);
    setSyncResult(null);
    try {
      const result = await pulpRepositoryManagementService.publish(kind, repo.pulp_href);
      if (!result.ok) {
        throw new Error(result.detail);
      }
      setPublishResult({
        repoName: repo.name,
        publication: result.data.publication,
        task: result.data.task,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setBusyHref(null);
    }
  }

  async function handleDistribute(repo: PulpRepository) {
    setBusyHref(repo.pulp_href);
    setError(null);
    setDistributeResult(null);
    setSyncResult(null);
    try {
      const result = await pulpDistributionService.createForRepository(
        kind,
        repo.pulp_href,
        repo.name
      );
      if (!result.ok) {
        throw new Error(result.detail);
      }
      setDistributeResult({
        repoName: repo.name,
        name: result.data.name,
        pulp_href: result.data.pulp_href,
        base_url: result.data.base_url,
        base_path: result.data.base_path,
        task: result.data.task,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create distribution.");
    } finally {
      setBusyHref(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(count / query.pageSize));

  return (
    <AdminShell
      title="Repositories"
      description="List RPM, Debian, and File repositories; publish, create distributions, inspect content, or remove a repository."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading || isLoadingRepos || isDeleting || isCreating}
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
            Repositories ({count}) — {getPlugin(kind).label}
          </CardTitle>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <FormField label="Type">
                <select
                  value={kind}
                  onChange={(event) => {
                    setPublishResult(null);
                    setDistributeResult(null);
                    setSyncResult(null);
                    setKind(event.target.value as PulpPluginKind);
                    setRemoteFilter("");
                    setPage(1);
                  }}
                  disabled={isLoadingRepos}
                  className={selectClassName}
                >
                  {plugins.map((plugin) => (
                    <option key={plugin.kind} value={plugin.kind}>
                      {plugin.label}
                    </option>
                  ))}
                </select>
              </FormField>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPublishResult(null);
                  setDistributeResult(null);
                  setSyncResult(null);
                  void load();
                }}
                disabled={isLoadingRepos}
              >
                Refresh
              </Button>
              <Button type="button" variant="outline" onClick={openCreateModal}>
                Create repository
              </Button>
            </div>

            {publishResult ? (
              <div className="rounded-lg border border-emerald-300/80 bg-emerald-50/90 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/35">
                <p className="font-medium text-emerald-900 dark:text-emerald-100">
                  Published “{publishResult.repoName}” ({kind.toUpperCase()})
                </p>
                {publishResult.publication ? (
                  <p className="mt-2 break-all font-mono text-xs text-emerald-800 dark:text-emerald-200/90">
                    <span className="font-sans font-medium text-emerald-900 dark:text-emerald-100">
                      Publication:{" "}
                    </span>
                    {publishResult.publication}
                  </p>
                ) : (
                  <p className="mt-2 text-emerald-800/90 dark:text-emerald-200/80">
                    Publication href was not returned by Pulp (task may still have succeeded).
                  </p>
                )}
                {publishResult.task ? (
                  <p className="mt-1 break-all font-mono text-xs text-emerald-800/80 dark:text-emerald-300/70">
                    Task:{" "}
                    <Link
                      href={`/tasks/detail?pulp_href=${encodeURIComponent(publishResult.task)}`}
                      className="underline decoration-emerald-400 underline-offset-2"
                    >
                      {publishResult.task}
                    </Link>
                  </p>
                ) : null}
              </div>
            ) : null}

            {distributeResult ? (
              <div className="rounded-lg border border-sky-300/80 bg-sky-50/90 p-4 text-sm dark:border-sky-800 dark:bg-sky-950/35">
                <p className="font-medium text-sky-900 dark:text-sky-100">
                  {getPlugin(kind).label} distribution created for “{distributeResult.repoName}”
                </p>
                <p className="mt-1 text-sky-800 dark:text-sky-200/90">
                  <span className="font-medium">Distribution name:</span> {distributeResult.name}
                </p>
                <p className="mt-1 text-sky-800 dark:text-sky-200/90">
                  <span className="font-medium">base_path:</span>{" "}
                  <span className="font-mono text-xs">{distributeResult.base_path}</span>
                </p>
                {distributeResult.base_url ? (
                  <p className="mt-2">
                    <a
                      href={distributeResult.base_url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all font-mono text-xs text-sky-800 underline decoration-sky-400 underline-offset-2 hover:text-sky-950 dark:text-sky-200 dark:hover:text-sky-50"
                    >
                      {distributeResult.base_url}
                    </a>
                  </p>
                ) : null}
                {distributeResult.pulp_href ? (
                  <p className="mt-1 break-all font-mono text-xs text-sky-800/90 dark:text-sky-300/80">
                    {distributeResult.pulp_href}
                  </p>
                ) : null}
                {distributeResult.task ? (
                  <p className="mt-1 break-all font-mono text-xs text-sky-800/80 dark:text-sky-300/70">
                    Task:{" "}
                    <Link
                      href={`/tasks/detail?pulp_href=${encodeURIComponent(distributeResult.task)}`}
                      className="underline decoration-sky-400 underline-offset-2"
                    >
                      {distributeResult.task}
                    </Link>
                  </p>
                ) : null}
                <Link
                  href="/distributions/list"
                  className="mt-3 inline-flex rounded-md border border-sky-400/60 bg-white/80 px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100/80 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-100 dark:hover:bg-sky-900/60"
                >
                  Open distributions
                </Link>
              </div>
            ) : null}

            {syncResult ? (
              <div className="rounded-lg border border-violet-300/80 bg-violet-50/90 p-4 text-sm dark:border-violet-800 dark:bg-violet-950/35">
                <p className="font-medium text-violet-900 dark:text-violet-100">
                  Sync dispatched for “{syncResult.repoName}” ({kind.toUpperCase()})
                </p>
                <p className="mt-1 text-violet-800 dark:text-violet-200/90">
                  The sync runs in the background; open the task to follow its progress. A new
                  repository version is created only if the remote had content the repository did
                  not already have.
                </p>
                {syncResult.task ? (
                  <p className="mt-1 break-all font-mono text-xs text-violet-800/80 dark:text-violet-300/70">
                    Task:{" "}
                    <Link
                      href={`/tasks/detail?pulp_href=${encodeURIComponent(syncResult.task)}`}
                      className="underline decoration-violet-400 underline-offset-2"
                    >
                      {syncResult.task}
                    </Link>
                  </p>
                ) : null}
              </div>
            ) : null}

            <ListQueryBar
              search={query.search}
              onSearchChange={setSearch}
              pageSize={query.pageSize}
              onPageSizeChange={setPageSize}
              disabled={isLoadingRepos}
              q={query.q}
              onQChange={setQ}
              labelSelect={query.labelSelect}
              onLabelSelectChange={setLabelSelect}
            />
            <div className="flex flex-wrap items-end gap-3">
              <FormField label="Remote">
                <select
                  value={remoteFilter}
                  onChange={(e) => handleRemoteFilterChange(e.target.value)}
                  disabled={isLoadingRepos}
                  className={selectClassName}
                >
                  <option value="">All remotes</option>
                  {(remotesByKind[kind] ?? []).map((remote) => (
                    <option key={remote.pulp_href} value={remote.pulp_href}>
                      {remote.name}
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
                    <TableHeaderCell>Distribution URL</TableHeaderCell>
                    <TableHeaderCell>Labels</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((repo) => {
                    const distributionUrl = distributionUrlByRepo[repo.pulp_href];
                    return (
                    <TableRow key={repo.pulp_href} frozen={busyHref === repo.pulp_href}>
                      <TableCell className="font-medium">{repo.name}</TableCell>
                      <TableCell className="max-w-md">
                        {distributionUrl ? (
                          <a
                            href={distributionUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="break-all font-mono text-xs text-sky-800 underline decoration-sky-400/80 underline-offset-2 hover:text-sky-950 dark:text-sky-300 dark:hover:text-sky-100"
                          >
                            {distributionUrl}
                          </a>
                        ) : (
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <LabelChips labels={repo.pulp_labels} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          <DropdownMenu
                            onOpenChange={(open) => {
                              if (open) ensurePermissions(repo.pulp_href);
                            }}
                          >
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                disabled={busyHref === repo.pulp_href}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                                aria-label={`Actions for ${repo.name}`}
                              >
                                <MoreVertical className="size-4" strokeWidth={2} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[11rem]">
                              <DropdownMenuItem
                                asChild
                                disabled={!canOnRepo(repo.pulp_href, "change")}
                              >
                                <Link
                                  href={`/repositories/edit?kind=${kind}&pulp_href=${encodeURIComponent(repo.pulp_href)}`}
                                >
                                  <Pencil className="size-4" />
                                  Edit
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link
                                  href={`/repositories/versions?kind=${kind}&pulp_href=${encodeURIComponent(repo.pulp_href)}`}
                                >
                                  <GitBranch className="size-4" />
                                  Versions
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link
                                  href={`/repositories/content?pulp_href=${encodeURIComponent(repo.pulp_href)}`}
                                >
                                  <Package className="size-4" />
                                  Content
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={!canOnRepo(repo.pulp_href, "change")}
                                onSelect={() => setLabelsTarget(repo)}
                              >
                                <Tag className="size-4" />
                                Labels
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setAccessTarget(repo)}>
                                <ShieldCheck className="size-4" />
                                Access
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {getPlugin(kind).supportsSync ? (
                                <DropdownMenuItem
                                  disabled={busyHref === repo.pulp_href || !canOnRepo(repo.pulp_href, "sync")}
                                  onSelect={() => {
                                    setSyncResult(null);
                                    setSyncModalRepo(repo);
                                  }}
                                >
                                  <RefreshCw className="size-4" />
                                  Sync
                                </DropdownMenuItem>
                              ) : null}
                              {getPlugin(kind).supportsPublish ? (
                                <DropdownMenuItem
                                  disabled={busyHref === repo.pulp_href}
                                  onSelect={() => void handlePublish(repo)}
                                >
                                  <Upload className="size-4" />
                                  Publish
                                </DropdownMenuItem>
                              ) : null}
                              <DropdownMenuItem
                                disabled={busyHref === repo.pulp_href}
                                onSelect={() => void handleDistribute(repo)}
                              >
                                <Share2 className="size-4" />
                                Distribute
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                disabled={busyHref === repo.pulp_href || !canOnRepo(repo.pulp_href, "delete")}
                                onSelect={() => setDeleteModalRepo(repo)}
                              >
                                <Trash2 className="size-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableWrapper>
            <ListPagination
              page={query.page}
              totalPages={totalPages}
              onPageChange={setPage}
              disabled={isLoadingRepos}
            />
          </CardContent>
        </Card>
      )}

      {createModalOpen ? (
        <RepositoryCreateModal
          initialKind={kind}
          onClose={() => setCreateModalOpen(false)}
          onCreated={() => void load()}
          onBusyChange={setIsCreating}
        />
      ) : null}

      {deleteModalRepo ? (
        <RepositoryDeleteModal
          repo={deleteModalRepo}
          kind={kind}
          distributions={distributions}
          onClose={() => setDeleteModalRepo(null)}
          onDeleted={() => {
            setDeleteModalRepo(null);
            void load();
          }}
          onBusyChange={(busy) => {
            setIsDeleting(busy);
            setBusyHref(busy ? deleteModalRepo.pulp_href : null);
          }}
        />
      ) : null}

      {syncModalRepo ? (
        <RepositorySyncModal
          repo={syncModalRepo}
          kind={kind}
          onClose={() => setSyncModalRepo(null)}
          onSynced={(result) => {
            setSyncResult(result);
            setSyncModalRepo(null);
            void load();
          }}
          onBusyChange={(busy) => setBusyHref(busy ? syncModalRepo.pulp_href : null)}
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

function RepositoriesListSuspenseFallback() {
  const { sessionUser, isLoading, hasSession, error, logout } = usePulpAuthContext();
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);

  return (
    <AdminShell
      title="Repositories"
      description="List RPM, Debian, and File repositories; publish, create distributions, inspect content, or remove a repository."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      <Card>Loading repository list…</Card>
    </AdminShell>
  );
}

export default function RepositoriesListPage() {
  return (
    <Suspense fallback={<RepositoriesListSuspenseFallback />}>
      <RepositoriesListPageContent />
    </Suspense>
  );
}
