"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpGroups } from "@/components/pulp/use-pulp-groups";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { usePulpUsers } from "@/components/pulp/use-pulp-users";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
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
import { pulpRemoteService } from "@/services/pulp/remote-service";
import { PULP_PLUGINS, getPulpPlugin, type PulpPluginKind } from "@/lib/pulp-plugins";
import {
  PulpRemote,
  PulpRemotePolicy,
  RemoteCreatePayload,
  RemoteUpdatePayload,
} from "@/services/pulp/types";

type RemoteRow = PulpRemote;

const REMOTE_POLICIES: PulpRemotePolicy[] = ["immediate", "on_demand", "streamed"];

const selectClassName =
  "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

type RemoteFormState = {
  name: string;
  url: string;
  policy: PulpRemotePolicy;
  tls_validation: boolean;
  proxy_url: string;
  username: string;
  password: string;
  ca_cert: string;
  client_cert: string;
  client_key: string;
  download_concurrency: string;
  distributions: string;
};

function emptyRemoteForm(): RemoteFormState {
  return {
    name: "",
    url: "",
    policy: "immediate",
    tls_validation: true,
    proxy_url: "",
    username: "",
    password: "",
    ca_cert: "",
    client_cert: "",
    client_key: "",
    download_concurrency: "",
    distributions: "",
  };
}

function formFromRemote(remote: RemoteRow): RemoteFormState {
  return {
    name: remote.name,
    url: remote.url,
    policy: remote.policy,
    tls_validation: remote.tls_validation,
    proxy_url: remote.proxy_url ?? "",
    // Secrets are never returned by Pulp; leave blank so an unchanged edit does not clear them.
    username: "",
    password: "",
    ca_cert: remote.ca_cert ?? "",
    client_cert: remote.client_cert ?? "",
    client_key: "",
    download_concurrency:
      remote.download_concurrency === null ? "" : String(remote.download_concurrency),
    distributions: "distributions" in remote ? remote.distributions ?? "" : "",
  };
}

function trimOrNull(value: string): string | null {
  const t = value.trim();
  return t === "" ? null : t;
}

function parseConcurrency(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : null;
}

function formToCreatePayload(
  form: RemoteFormState,
  kind: PulpPluginKind
): RemoteCreatePayload {
  const payload: RemoteCreatePayload = {
    name: form.name.trim(),
    url: form.url.trim(),
    policy: form.policy,
    tls_validation: form.tls_validation,
    proxy_url: trimOrNull(form.proxy_url),
    username: trimOrNull(form.username),
    password: trimOrNull(form.password),
    ca_cert: trimOrNull(form.ca_cert),
    client_cert: trimOrNull(form.client_cert),
    client_key: trimOrNull(form.client_key),
    download_concurrency: parseConcurrency(form.download_concurrency),
  };
  if (getPulpPlugin(kind).extraRemoteFields.includes("distributions")) {
    payload.distributions = trimOrNull(form.distributions);
  }
  return payload;
}

function formToUpdatePayload(
  form: RemoteFormState,
  kind: PulpPluginKind
): RemoteUpdatePayload {
  const payload: RemoteUpdatePayload = {
    name: form.name.trim(),
    url: form.url.trim(),
    policy: form.policy,
    tls_validation: form.tls_validation,
    proxy_url: trimOrNull(form.proxy_url),
    ca_cert: trimOrNull(form.ca_cert),
    client_cert: trimOrNull(form.client_cert),
    download_concurrency: parseConcurrency(form.download_concurrency),
  };
  if (getPulpPlugin(kind).extraRemoteFields.includes("distributions")) {
    payload.distributions = trimOrNull(form.distributions);
  }
  // Only send secrets when the user typed a new value; blank means "leave unchanged".
  const username = form.username.trim();
  const password = form.password.trim();
  const clientKey = form.client_key.trim();
  if (username) payload.username = username;
  if (password) payload.password = password;
  if (clientKey) payload.client_key = clientKey;
  return payload;
}

function formatIso(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString();
}

export default function RemotesListPage() {
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, setError, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);

  const [kind, setKind] = useState<PulpPluginKind>("rpm");
  const [remotes, setRemotes] = useState<RemoteRow[]>([]);
  const [isLoadingRemotes, setIsLoadingRemotes] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<RemoteRow | null>(null);
  const [form, setForm] = useState<RemoteFormState>(emptyRemoteForm());
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [busyHref, setBusyHref] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasSession) return;
    setIsLoadingRemotes(true);
    setError(null);
    try {
      const list = await pulpRemoteService.list(kind);
      setRemotes(list);
    } catch (e) {
      setRemotes([]);
      setError(e instanceof Error ? e.message : "Failed to load remotes.");
    } finally {
      setIsLoadingRemotes(false);
    }
  }, [hasSession, kind, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const modalOpen = createOpen || editing !== null;

  const closeModal = useCallback(() => {
    if (isSaving) return;
    setCreateOpen(false);
    setEditing(null);
    setForm(emptyRemoteForm());
    setModalError(null);
  }, [isSaving]);

  useEffect(() => {
    if (!modalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) {
        closeModal();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [modalOpen, closeModal, isSaving]);

  function openCreate() {
    setEditing(null);
    setForm(emptyRemoteForm());
    setModalError(null);
    setCreateOpen(true);
  }

  function openEdit(remote: RemoteRow) {
    setCreateOpen(false);
    setForm(formFromRemote(remote));
    setModalError(null);
    setEditing(remote);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModalError(null);

    if (!form.name.trim()) {
      setModalError("Remote name is required.");
      return;
    }
    if (!form.url.trim()) {
      setModalError("Remote URL is required.");
      return;
    }

    setIsSaving(true);
    try {
      if (editing) {
        const result = await pulpRemoteService.update(
          kind,
          editing.pulp_href,
          formToUpdatePayload(form, kind)
        );
        if (!result.ok) {
          setModalError(result.detail);
          return;
        }
      } else {
        await pulpRemoteService.create(kind, formToCreatePayload(form, kind));
      }
      setCreateOpen(false);
      setEditing(null);
      setForm(emptyRemoteForm());
      await load();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(remote: RemoteRow) {
    if (!window.confirm(`Delete remote “${remote.name}”? This cannot be undone.`)) {
      return;
    }
    setBusyHref(remote.pulp_href);
    setError(null);
    try {
      const result = await pulpRemoteService.remove(kind, remote.pulp_href);
      if (!result.ok) {
        setError(result.detail);
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusyHref(null);
    }
  }

  return (
    <AdminShell
      title="Remotes"
      description="Remotes describe an upstream repository to sync content from. Create, edit, or remove remotes here, then sync a repository against one."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading || isLoadingRemotes || isSaving}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      {isCheckingSession || isRedirectingToLogin ? (
        <Card>Checking existing session...</Card>
      ) : (
        <Card className="flex flex-col gap-0 p-0">
          <div className="flex flex-col gap-3 border-b border-zinc-200/80 px-5 py-4 dark:border-zinc-800/80 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="mb-0">
              Remotes — {kind.toUpperCase()}
              {remotes.length > 0 ? (
                <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
                  ({remotes.length.toLocaleString()} total)
                </span>
              ) : null}
            </CardTitle>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void load()}
                disabled={isLoadingRemotes}
              >
                Refresh
              </Button>
              <Button type="button" onClick={openCreate} disabled={isLoading}>
                Create remote
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-b border-zinc-200/80 px-5 py-3 dark:border-zinc-800/80">
            {PULP_PLUGINS.map((plugin) => (
              <button
                key={plugin.kind}
                type="button"
                onClick={() => setKind(plugin.kind)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm",
                  kind === plugin.kind
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-zinc-300 dark:border-zinc-700"
                )}
              >
                {plugin.kind.toUpperCase()}
              </button>
            ))}
          </div>
          <CardContent className="space-y-4 p-5">
            <TableWrapper>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>URL</TableHeaderCell>
                    <TableHeaderCell>Policy</TableHeaderCell>
                    <TableHeaderCell>TLS</TableHeaderCell>
                    <TableHeaderCell>Updated</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {isLoadingRemotes && remotes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-zinc-500">
                        Loading remotes…
                      </TableCell>
                    </TableRow>
                  ) : !isLoadingRemotes && remotes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-zinc-500">
                        No {kind.toUpperCase()} remotes yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    remotes.map((remote) => (
                      <TableRow key={remote.pulp_href}>
                        <TableCell className="max-w-[16rem] font-medium">
                          <span title={remote.name}>{remote.name}</span>
                        </TableCell>
                        <TableCell className="max-w-[24rem] font-mono text-xs">
                          <span className="break-all" title={remote.url}>
                            {remote.url}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {remote.policy}
                        </TableCell>
                        <TableCell>
                          {remote.tls_validation ? (
                            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                              on
                            </span>
                          ) : (
                            <span className="rounded-md bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                              off
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatIso(remote.pulp_last_updated ?? remote.pulp_created)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="px-3 py-1.5 text-xs"
                              onClick={() => openEdit(remote)}
                              disabled={isLoading || busyHref === remote.pulp_href}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                              onClick={() => void handleDelete(remote)}
                              disabled={isLoading || busyHref === remote.pulp_href}
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
          </CardContent>
        </Card>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-black/50"
            onClick={closeModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remote-modal-title"
            className="relative z-[101] max-h-[min(90vh,44rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200/90 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h2
              id="remote-modal-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              {editing ? "Edit remote" : `New ${kind.toUpperCase()} remote`}
            </h2>
            {editing ? (
              <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {editing.name}
              </p>
            ) : kind === "rpm" ? (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Points at an upstream RPM repository (the URL containing{" "}
                <span className="font-mono">repodata/</span>).
              </p>
            ) : kind === "deb" ? (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Points at an upstream Debian APT repository root (the URL containing{" "}
                <span className="font-mono">dists/</span>).
              </p>
            ) : (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Points at an upstream File repository (the URL containing{" "}
                <span className="font-mono">PULP_MANIFEST</span>).
              </p>
            )}
            <form className="mt-5 grid gap-4" onSubmit={handleSubmit} noValidate>
              {modalError ? (
                <p
                  role="alert"
                  className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
                >
                  {modalError}
                </p>
              ) : null}
              <FormField label="Name">
                <Input
                  value={form.name}
                  onChange={(event) => {
                    setModalError(null);
                    setForm((f) => ({ ...f, name: event.target.value }));
                  }}
                  autoFocus
                  placeholder={kind === "rpm" ? "epel-9" : kind === "deb" ? "debian-bookworm" : "my-file-remote"}
                />
              </FormField>
              <FormField label="URL">
                <Input
                  value={form.url}
                  onChange={(event) => {
                    setModalError(null);
                    setForm((f) => ({ ...f, url: event.target.value }));
                  }}
                  className="font-mono"
                  placeholder={
                    kind === "rpm"
                      ? "https://dl.fedoraproject.org/pub/epel/9/Everything/x86_64/"
                      : kind === "deb"
                        ? "http://deb.debian.org/debian"
                        : "https://example.com/path/to/PULP_MANIFEST"
                  }
                />
              </FormField>
              {getPulpPlugin(kind).extraRemoteFields.includes("distributions") ? (
                <FormField label="Distributions (optional)">
                  <Input
                    value={form.distributions}
                    onChange={(event) =>
                      setForm((f) => ({ ...f, distributions: event.target.value }))
                    }
                    className="font-mono"
                    placeholder="bookworm bookworm-updates"
                  />
                </FormField>
              ) : null}
              <FormField label="Download policy">
                <select
                  value={form.policy}
                  onChange={(event) => {
                    setModalError(null);
                    setForm((f) => ({
                      ...f,
                      policy: event.target.value as PulpRemotePolicy,
                    }));
                  }}
                  className={selectClassName}
                >
                  {REMOTE_POLICIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </FormField>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={form.tls_validation}
                  onChange={(event) =>
                    setForm((f) => ({ ...f, tls_validation: event.target.checked }))
                  }
                  className="h-4 w-4"
                />
                Validate TLS certificate of the upstream server
              </label>
              <FormField label="Download concurrency (optional)">
                <Input
                  value={form.download_concurrency}
                  onChange={(event) =>
                    setForm((f) => ({ ...f, download_concurrency: event.target.value }))
                  }
                  inputMode="numeric"
                  placeholder="10"
                />
              </FormField>
              <FormField label="Proxy URL (optional)">
                <Input
                  value={form.proxy_url}
                  onChange={(event) => setForm((f) => ({ ...f, proxy_url: event.target.value }))}
                  className="font-mono"
                  placeholder="http://proxy.example.com:3128"
                />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Username (optional)">
                  <Input
                    value={form.username}
                    onChange={(event) => setForm((f) => ({ ...f, username: event.target.value }))}
                    autoComplete="off"
                  />
                </FormField>
                <FormField label="Password (optional)">
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((f) => ({ ...f, password: event.target.value }))}
                    autoComplete="new-password"
                    placeholder={editing ? "Leave blank to keep current" : ""}
                  />
                </FormField>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeModal} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving
                    ? editing
                      ? "Saving…"
                      : "Creating…"
                    : editing
                      ? "Save changes"
                      : "Create remote"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
