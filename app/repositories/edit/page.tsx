"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/pulp/admin-shell";
import { ActivityLog, type ActivityLine } from "@/components/pulp/activity-log";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { RepositoryEditDebForm } from "@/components/pulp/repository-edit-deb-form";
import { RepositoryEditFileForm } from "@/components/pulp/repository-edit-file-form";
import { RepositoryEditRpmForm } from "@/components/pulp/repository-edit-rpm-form";
import { usePulpGroups } from "@/components/pulp/use-pulp-groups";
import { usePulpObjectPermissions } from "@/components/pulp/use-pulp-object-permissions";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { usePulpUsers } from "@/components/pulp/use-pulp-users";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { pulpDistributionService } from "@/services/pulp/distribution-service";
import { type PulpPluginKind } from "@/lib/pulp-plugins";
import {
  debDetailToForm,
  fileDetailToForm,
  rpmDetailToForm,
  type RpmReadOnlyMeta,
} from "@/lib/repository-edit-form";
import { pulpRemoteService } from "@/services/pulp/remote-service";
import { pulpRepositoryManagementService } from "@/services/pulp/repository-management-service";
import type { PulpRemote, RepositoryUpdatePayload } from "@/services/pulp/types";

type RepoKind = PulpPluginKind;

function RepositoriesEditInner() {
  const searchParams = useSearchParams();
  const rawKind = searchParams.get("kind");
  const kindParam: RepoKind = rawKind === "deb" || rawKind === "file" ? rawKind : "rpm";
  const pulpHref = searchParams.get("pulp_href")?.trim() ?? "";

  const { sessionUser, isLoading, isCheckingSession, hasSession, error, setError, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);
  const { ensure: ensurePermissions, can: canOnRepo } = usePulpObjectPermissions();

  const [loadedKind, setLoadedKind] = useState<RepoKind | null>(null);
  const [rpm, setRpm] = useState<RepositoryUpdatePayload | null>(null);
  const [rpmMeta, setRpmMeta] = useState<RpmReadOnlyMeta | null>(null);
  const [deb, setDeb] = useState<RepositoryUpdatePayload | null>(null);
  const [fileRepo, setFileRepo] = useState<RepositoryUpdatePayload | null>(null);
  const [rpmRemotes, setRpmRemotes] = useState<PulpRemote[]>([]);
  const [debRemotes, setDebRemotes] = useState<PulpRemote[]>([]);
  const [fileRemotes, setFileRemotes] = useState<PulpRemote[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveAlsoPublish, setSaveAlsoPublish] = useState(false);
  const [saveAlsoDistribute, setSaveAlsoDistribute] = useState(false);
  const [activityLog, setActivityLog] = useState<ActivityLine[]>([]);

  useEffect(() => {
    if (!hasSession || !pulpHref) {
      setLoadedKind(null);
      setRpm(null);
      setRpmMeta(null);
      setDeb(null);
      setFileRepo(null);
      setSaveAlsoPublish(false);
      setSaveAlsoDistribute(false);
      setActivityLog([]);
      return;
    }

    let active = true;

    async function load() {
      const loadLineId = crypto.randomUUID();
      setIsLoadingDetail(true);
      setError(null);
      setSaveAlsoPublish(false);
      setSaveAlsoDistribute(false);
      setActivityLog([
        { id: loadLineId, label: "Open edit page — loading repository from Pulp", phase: "running" },
      ]);
      try {
        const detail = await pulpRepositoryManagementService.getRepositoryDetail(pulpHref);
        if (!active) return;
        setLoadedKind(detail.kind);
        if (detail.kind === "rpm") {
          setRpm(rpmDetailToForm(detail));
          setRpmMeta({
            pulp_href: detail.pulp_href,
            pulp_created: detail.pulp_created,
            versions_href: detail.versions_href,
            latest_version_href: detail.latest_version_href,
          });
          setDeb(null);
          setFileRepo(null);
        } else if (detail.kind === "deb") {
          setDeb(debDetailToForm(detail));
          setRpm(null);
          setRpmMeta(null);
          setFileRepo(null);
        } else {
          setFileRepo(fileDetailToForm(detail));
          setRpm(null);
          setRpmMeta(null);
          setDeb(null);
        }
        setActivityLog((prev) =>
          prev.map((line) =>
            line.id === loadLineId
              ? {
                  ...line,
                  phase: "done" as const,
                  detail: `${detail.kind.toUpperCase()} · ${detail.name}`,
                }
              : line
          )
        );
      } catch (e) {
        if (!active) return;
        setLoadedKind(null);
        setRpm(null);
        setRpmMeta(null);
        setDeb(null);
        setFileRepo(null);
        const message = e instanceof Error ? e.message : "Failed to load repository.";
        setError(message);
        setActivityLog((prev) =>
          prev.map((line) =>
            line.id === loadLineId ? { ...line, phase: "failed" as const, detail: message } : line
          )
        );
      } finally {
        if (active) setIsLoadingDetail(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [hasSession, pulpHref, setError]);

  useEffect(() => {
    if (hasSession && pulpHref) ensurePermissions(pulpHref);
  }, [hasSession, pulpHref, ensurePermissions]);

  useEffect(() => {
    if (!hasSession) {
      setRpmRemotes([]);
      setDebRemotes([]);
      setFileRemotes([]);
      return;
    }

    let active = true;

    async function loadRemotes() {
      try {
        const remotes = await pulpRemoteService.list("rpm");
        if (active) setRpmRemotes(remotes.results);
      } catch {
        if (active) setRpmRemotes([]);
      }
      try {
        const remotes = await pulpRemoteService.list("deb");
        if (active) setDebRemotes(remotes.results);
      } catch {
        if (active) setDebRemotes([]);
      }
      try {
        const remotes = await pulpRemoteService.list("file");
        if (active) setFileRemotes(remotes.results);
      } catch {
        if (active) setFileRemotes([]);
      }
    }

    void loadRemotes();
    return () => {
      active = false;
    };
  }, [hasSession]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pulpHref || !loadedKind) return;

    if (loadedKind === "rpm") {
      if (!rpm?.name.trim()) {
        setError("Repository name is required.");
        return;
      }
    } else if (loadedKind === "deb" && !deb?.name.trim()) {
      setError("Repository name is required.");
      return;
    } else if (loadedKind === "file" && !fileRepo?.name.trim()) {
      setError("Repository name is required.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const saveLineId = crypto.randomUUID();
    setActivityLog((prev) => [
      ...prev,
      { id: saveLineId, label: "Save — write repository settings to Pulp", phase: "running" },
    ]);

    try {
      const result =
        loadedKind === "rpm" && rpm
          ? await pulpRepositoryManagementService.update(loadedKind, pulpHref, rpm)
          : loadedKind === "deb" && deb
            ? await pulpRepositoryManagementService.update(loadedKind, pulpHref, deb)
            : loadedKind === "file" && fileRepo
              ? await pulpRepositoryManagementService.update(loadedKind, pulpHref, fileRepo)
            : null;
      if (!result) {
        setError("Nothing to save.");
        setActivityLog((prev) =>
          prev.map((line) =>
            line.id === saveLineId
              ? { ...line, phase: "failed" as const, detail: "Nothing to save." }
              : line
          )
        );
        return;
      }
      if (!result.ok) {
        throw new Error(result.detail);
      }
      setActivityLog((prev) =>
        prev.map((line) =>
          line.id === saveLineId
            ? {
                ...line,
                phase: "done" as const,
                detail: `Repository updated · name: ${result.data.name}`,
              }
            : line
        )
      );
      if (loadedKind === "rpm" && rpm) {
        setRpm({ ...rpm, name: result.data.name });
      }
      if (loadedKind === "deb" && deb) {
        setDeb({ ...deb, name: result.data.name });
      }
      if (loadedKind === "file" && fileRepo) {
        setFileRepo({ ...fileRepo, name: result.data.name });
      }

      let publishFailed = false;
      if (saveAlsoPublish) {
        const publishLineId = crypto.randomUUID();
        setActivityLog((prev) => [
          ...prev,
          { id: publishLineId, label: "Publish — create publication from repository", phase: "running" },
        ]);
        try {
          const published = await pulpRepositoryManagementService.publish(loadedKind, pulpHref);
          if (!published.ok) {
            throw new Error(published.detail);
          }
          const pubDetail = [
            published.data.publication ? `publication: ${published.data.publication}` : null,
            published.data.task ? `task: ${published.data.task}` : null,
          ]
            .filter(Boolean)
            .join("\n");
          setActivityLog((prev) =>
            prev.map((line) =>
              line.id === publishLineId
                ? {
                    ...line,
                    phase: "done" as const,
                    detail: pubDetail || "Completed (no publication href returned).",
                  }
                : line
            )
          );
        } catch (e) {
          publishFailed = true;
          const msg = e instanceof Error ? e.message : "Publish failed.";
          setError(msg);
          setActivityLog((prev) =>
            prev.map((line) =>
              line.id === publishLineId ? { ...line, phase: "failed" as const, detail: msg } : line
            )
          );
        }
      }

      if (saveAlsoDistribute && loadedKind === "rpm" && !(saveAlsoPublish && publishFailed)) {
        const distLineId = crypto.randomUUID();
        setActivityLog((prev) => [
          ...prev,
          { id: distLineId, label: "Distribute — create or update RPM distribution", phase: "running" },
        ]);
        try {
          const distributed = await pulpDistributionService.createForRepository(
            loadedKind,
            pulpHref,
            result.data.name
          );
          if (!distributed.ok) {
            throw new Error(distributed.detail);
          }
          const distDetail = [
            `name: ${distributed.data.name}`,
            `base_path: ${distributed.data.base_path}`,
            distributed.data.base_url ? `base_url: ${distributed.data.base_url}` : null,
            distributed.data.pulp_href ? `href: ${distributed.data.pulp_href}` : null,
            distributed.data.task ? `task: ${distributed.data.task}` : null,
          ]
            .filter(Boolean)
            .join("\n");
          setActivityLog((prev) =>
            prev.map((line) =>
              line.id === distLineId ? { ...line, phase: "done" as const, detail: distDetail } : line
            )
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Failed to create distribution.";
          setError(msg);
          setActivityLog((prev) =>
            prev.map((line) =>
              line.id === distLineId ? { ...line, phase: "failed" as const, detail: msg } : line
            )
          );
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Update failed.";
      setError(msg);
      setActivityLog((prev) =>
        prev.map((line) =>
          line.id === saveLineId ? { ...line, phase: "failed" as const, detail: msg } : line
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const missingParams = !pulpHref;
  const kindMismatch =
    loadedKind !== null && kindParam !== loadedKind
      ? `This href is a ${loadedKind.toUpperCase()} repository; list opened it as ${kindParam.toUpperCase()}.`
      : null;

  return (
    <AdminShell
      title="Edit repository"
      description="Update repository settings (matches Pulp RPM, Debian APT, and File repository APIs)."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading || isLoadingDetail || isSubmitting}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      {isCheckingSession || isRedirectingToLogin ? (
        <Card>Checking existing session...</Card>
      ) : missingParams ? (
        <Card>
          <CardTitle>Missing repository</CardTitle>
          <CardContent className="space-y-3 text-sm">
            <p>Open this page from the repository list using Edit, or append query parameters:</p>
            <p className="break-all font-mono text-xs text-zinc-600 dark:text-zinc-400">
              /repositories/edit?kind=file&amp;pulp_href=…
            </p>
            <Link
              href="/repositories/list"
              className="inline-flex rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Back to list
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {kindMismatch ? (
            <Card className="border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30">
              <CardContent className="pt-6 text-sm text-amber-900 dark:text-amber-100">
                {kindMismatch}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardTitle>Repository {loadedKind ? `(${loadedKind.toUpperCase()})` : ""}</CardTitle>
            <CardContent className="space-y-3">
              <p className="break-all font-mono text-xs text-zinc-600 dark:text-zinc-400">
                {rpmMeta?.pulp_href ?? pulpHref}
              </p>
              {rpmMeta ? (
                <>
                  <dl className="grid gap-2 border-t border-zinc-200 pt-3 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                    {rpmMeta.pulp_created ? (
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-medium text-zinc-700 dark:text-zinc-300">Created</dt>
                        <dd>{rpmMeta.pulp_created}</dd>
                      </div>
                    ) : null}
                    {rpmMeta.latest_version_href ? (
                      <div className="flex flex-col gap-0.5">
                        <dt className="font-medium text-zinc-700 dark:text-zinc-300">Latest version</dt>
                        <dd className="break-all font-mono">{rpmMeta.latest_version_href}</dd>
                      </div>
                    ) : null}
                    {rpmMeta.versions_href ? (
                      <div className="flex flex-col gap-0.5">
                        <dt className="font-medium text-zinc-700 dark:text-zinc-300">Versions list</dt>
                        <dd className="break-all font-mono">{rpmMeta.versions_href}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {loadedKind === "rpm" && pulpHref ? (
                    <div className="pt-2">
                      <Link
                        href={`/repositories/versions?kind=${loadedKind}&pulp_href=${encodeURIComponent(pulpHref)}`}
                        className="inline-flex rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                      >
                        Version history
                      </Link>
                    </div>
                  ) : null}
                </>
              ) : null}

              {isLoadingDetail ? (
                <p className="text-sm text-zinc-500">Loading…</p>
              ) : loadedKind === null ? (
                <p className="text-sm text-zinc-500">Could not load this repository.</p>
              ) : loadedKind === "rpm" && rpm ? (
                <RepositoryEditRpmForm
                  value={rpm}
                  onChange={setRpm}
                  remotes={rpmRemotes}
                  pulpHref={pulpHref}
                  canOnRepo={canOnRepo}
                  isSubmitting={isSubmitting}
                  saveAlsoPublish={saveAlsoPublish}
                  setSaveAlsoPublish={setSaveAlsoPublish}
                  saveAlsoDistribute={saveAlsoDistribute}
                  setSaveAlsoDistribute={setSaveAlsoDistribute}
                  onSubmit={handleSubmit}
                />
              ) : loadedKind === "deb" && deb ? (
                <RepositoryEditDebForm
                  value={deb}
                  onChange={setDeb}
                  remotes={debRemotes}
                  pulpHref={pulpHref}
                  canOnRepo={canOnRepo}
                  isSubmitting={isSubmitting}
                  saveAlsoPublish={saveAlsoPublish}
                  setSaveAlsoPublish={setSaveAlsoPublish}
                  onSubmit={handleSubmit}
                />
              ) : loadedKind === "file" && fileRepo ? (
                <RepositoryEditFileForm
                  value={fileRepo}
                  onChange={setFileRepo}
                  remotes={fileRemotes}
                  pulpHref={pulpHref}
                  canOnRepo={canOnRepo}
                  isSubmitting={isSubmitting}
                  saveAlsoPublish={saveAlsoPublish}
                  setSaveAlsoPublish={setSaveAlsoPublish}
                  onSubmit={handleSubmit}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardTitle>Activity log</CardTitle>
            <CardContent>
              {activityLog.length > 0 ? (
                <ActivityLog lines={activityLog} />
              ) : (
                <p className="text-sm text-zinc-500">Open a repository from the list to see load progress here.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </AdminShell>
  );
}

export default function RepositoriesEditPage() {
  return (
    <Suspense fallback={<Card className="p-6">Loading…</Card>}>
      <RepositoriesEditInner />
    </Suspense>
  );
}
