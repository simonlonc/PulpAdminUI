"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { usePulpPluginsContext } from "./plugins-context";
import { pulpRemoteService } from "@/services/pulp/remote-service";
import { type PulpPluginKind } from "@/lib/pulp-plugins";
import {
  emptyRemoteForm,
  formFromRemote,
  formToCreatePayload,
  formToUpdatePayload,
  invalidJsonExtraField,
  missingRequiredExtraField,
  type RemoteFormState,
} from "@/lib/remote-form";
import { PulpRemote, PulpRemotePolicy } from "@/services/pulp/types";

const REMOTE_POLICIES: PulpRemotePolicy[] = ["immediate", "on_demand", "streamed"];

const selectClassName =
  "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

const textareaClassName =
  "min-h-[4rem] w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm font-mono dark:border-zinc-700";

export type RemoteFormModalProps = {
  kind: PulpPluginKind;
  editing: PulpRemote | null;
  onClose: () => void;
  onSaved: () => void;
  onBusyChange: (busy: boolean) => void;
};

export function RemoteFormModal({ kind, editing, onClose, onSaved, onBusyChange }: RemoteFormModalProps) {
  const { getPlugin } = usePulpPluginsContext();
  const plugin = getPlugin(kind);

  const [form, setForm] = useState<RemoteFormState>(() =>
    editing ? formFromRemote(editing, plugin) : emptyRemoteForm(plugin)
  );
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isSaving, onClose]);

  function close() {
    if (isSaving) return;
    onClose();
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
    const missingField = missingRequiredExtraField(form, plugin);
    if (missingField) {
      setModalError(`${missingField.label} is required.`);
      return;
    }
    const invalidJsonField = invalidJsonExtraField(form, plugin);
    if (invalidJsonField) {
      setModalError(`${invalidJsonField.label} must be valid JSON.`);
      return;
    }

    onBusyChange(true);
    setIsSaving(true);
    try {
      if (editing) {
        const result = await pulpRemoteService.update(
          kind,
          editing.pulp_href,
          formToUpdatePayload(form, plugin)
        );
        if (!result.ok) {
          setModalError(result.detail);
          return;
        }
      } else {
        const result = await pulpRemoteService.create(kind, formToCreatePayload(form, plugin));
        if (!result.ok) {
          setModalError(result.detail);
          return;
        }
      }
      onSaved();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      onBusyChange(false);
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/50"
        onClick={close}
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
              placeholder={plugin.remoteUrlPlaceholder}
            />
          </FormField>
          {plugin.extraRemoteFields.map((field) => {
            const fieldLabel = field.required ? field.label : `${field.label} (optional)`;
            if (field.type === "boolean") {
              return (
                <label
                  key={field.name}
                  className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(form.extra[field.name])}
                    onChange={(event) =>
                      setForm((f) => ({
                        ...f,
                        extra: { ...f.extra, [field.name]: event.target.checked },
                      }))
                    }
                    className="h-4 w-4"
                  />
                  {field.label}
                </label>
              );
            }
            if (field.type === "string_list" && field.options) {
              const selected = Array.isArray(form.extra[field.name])
                ? (form.extra[field.name] as string[])
                : [];
              return (
                <FormField key={field.name} label={fieldLabel}>
                  <select
                    multiple
                    value={selected}
                    onChange={(event) => {
                      setModalError(null);
                      const values = Array.from(
                        event.target.selectedOptions,
                        (option) => option.value
                      );
                      setForm((f) => ({ ...f, extra: { ...f.extra, [field.name]: values } }));
                    }}
                    className={selectClassName}
                    size={Math.min(field.options.length, 6)}
                  >
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </FormField>
              );
            }
            if (field.type === "string_list") {
              const lines = Array.isArray(form.extra[field.name])
                ? (form.extra[field.name] as string[]).join("\n")
                : "";
              return (
                <FormField key={field.name} label={fieldLabel}>
                  <textarea
                    value={lines}
                    onChange={(event) => {
                      setModalError(null);
                      const values = event.target.value.split("\n");
                      setForm((f) => ({ ...f, extra: { ...f.extra, [field.name]: values } }));
                    }}
                    className={textareaClassName}
                    rows={3}
                    placeholder={field.placeholder}
                  />
                </FormField>
              );
            }
            if (field.type === "json") {
              return (
                <FormField key={field.name} label={fieldLabel}>
                  <textarea
                    value={String(form.extra[field.name] ?? "")}
                    onChange={(event) => {
                      setModalError(null);
                      setForm((f) => ({
                        ...f,
                        extra: { ...f.extra, [field.name]: event.target.value },
                      }));
                    }}
                    className={textareaClassName}
                    rows={3}
                    placeholder={field.placeholder}
                  />
                </FormField>
              );
            }
            return (
              <FormField key={field.name} label={fieldLabel}>
                <Input
                  value={String(form.extra[field.name] ?? "")}
                  onChange={(event) => {
                    setModalError(null);
                    setForm((f) => ({
                      ...f,
                      extra: { ...f.extra, [field.name]: event.target.value },
                    }));
                  }}
                  className="font-mono"
                  inputMode={field.type === "integer" ? "numeric" : undefined}
                  placeholder={field.placeholder}
                />
              </FormField>
            );
          })}
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
            <Button type="button" variant="outline" onClick={close} disabled={isSaving}>
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
  );
}
