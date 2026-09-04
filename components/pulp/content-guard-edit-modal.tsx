"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { pulpContentGuardService } from "@/services/pulp/content-guard-service";
import { pulpContentGuardKindFromHref } from "@/services/pulp/content-guard-kinds";
import { PulpContentGuard, PulpContentGuardDetail, UpdatePulpContentGuardPayload } from "@/services/pulp/types";

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

const textareaClass =
  "min-h-[7rem] w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 font-mono text-xs dark:border-zinc-700";

export type ContentGuardEditModalProps = {
  contentGuard: PulpContentGuard;
  onClose: () => void;
  onSaved: () => void;
};

export function ContentGuardEditModal({
  contentGuard,
  onClose,
  onSaved,
}: ContentGuardEditModalProps) {
  const kind = pulpContentGuardKindFromHref(contentGuard.pulp_href);
  const [detail, setDetail] = useState<PulpContentGuardDetail | null>(null);
  const [allGuards, setAllGuards] = useState<PulpContentGuard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const titleId = useId();

  const [name, setName] = useState(contentGuard.name);
  const [description, setDescription] = useState(contentGuard.description ?? "");
  const [headerName, setHeaderName] = useState("");
  const [headerValue, setHeaderValue] = useState("");
  const [jqFilter, setJqFilter] = useState("");
  const [caCertificate, setCaCertificate] = useState("");
  const [guards, setGuards] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      try {
        const [guardDetail, guardsPage] = await Promise.all([
          pulpContentGuardService.get(contentGuard.pulp_href),
          kind === "core.composite"
            ? pulpContentGuardService.list(new URLSearchParams({ limit: "200", offset: "0" }))
            : Promise.resolve(null),
        ]);
        if (!active) return;

        setDetail(guardDetail);
        setName(guardDetail.name);
        setDescription(guardDetail.description ?? "");
        setHeaderName(guardDetail.header_name ?? "");
        setHeaderValue(guardDetail.header_value ?? "");
        setJqFilter(guardDetail.jq_filter ?? "");
        setCaCertificate(guardDetail.ca_certificate ?? "");
        setGuards(guardDetail.guards ?? []);
        if (guardsPage) {
          setAllGuards(guardsPage.results.filter((g) => g.pulp_href !== contentGuard.pulp_href));
        }
      } catch (error) {
        if (active) {
          setModalError(
            error instanceof Error ? error.message : "Failed to load content guard detail."
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [contentGuard.pulp_href, kind]);

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

  async function handleSave() {
    setModalError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setModalError("Name is required.");
      return;
    }
    if (kind === "core.header") {
      if (!headerName.trim()) {
        setModalError("Header name is required.");
        return;
      }
      if (!headerValue) {
        setModalError("Header value is required.");
        return;
      }
    }
    if ((kind === "certguard.x509" || kind === "certguard.rhsm") && !caCertificate.trim()) {
      setModalError("CA certificate is required.");
      return;
    }

    const payload: UpdatePulpContentGuardPayload = {
      name: trimmedName,
      description: description.trim() || null,
    };
    if (kind === "core.header") {
      payload.header_name = headerName.trim();
      payload.header_value = headerValue;
      payload.jq_filter = jqFilter.trim() || null;
    } else if (kind === "certguard.x509" || kind === "certguard.rhsm") {
      payload.ca_certificate = caCertificate;
    } else if (kind === "core.composite") {
      payload.guards = guards;
    }

    setIsSaving(true);
    try {
      const result = await pulpContentGuardService.update(contentGuard.pulp_href, payload);
      if (!result.ok) {
        setModalError(result.detail);
        return;
      }
      onSaved();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/50 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Edit content guard
        </h2>
        <p className="mt-1 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {contentGuard.pulp_href}
        </p>

        {modalError ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
          >
            {modalError}
          </p>
        ) : null}

        {isLoading ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <FormField label="Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} disabled={isSaving} />
            </FormField>
            <FormField label="Description">
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={isSaving}
              />
            </FormField>
            {kind === "core.header" ? (
              <>
                <FormField label="Header name">
                  <Input
                    value={headerName}
                    onChange={(event) => setHeaderName(event.target.value)}
                    disabled={isSaving}
                  />
                </FormField>
                <FormField label="Header value">
                  <Input
                    value={headerValue}
                    onChange={(event) => setHeaderValue(event.target.value)}
                    disabled={isSaving}
                  />
                </FormField>
                <FormField label="JQ filter">
                  <Input
                    value={jqFilter}
                    onChange={(event) => setJqFilter(event.target.value)}
                    disabled={isSaving}
                  />
                </FormField>
              </>
            ) : null}
            {kind === "certguard.x509" || kind === "certguard.rhsm" ? (
              <FormField label="CA certificate">
                <textarea
                  className={textareaClass}
                  value={caCertificate}
                  onChange={(event) => setCaCertificate(event.target.value)}
                  disabled={isSaving}
                />
              </FormField>
            ) : null}
            {kind === "core.composite" ? (
              <FormField label="Guards">
                <select
                  multiple
                  value={guards}
                  onChange={(event) =>
                    setGuards(Array.from(event.target.selectedOptions, (option) => option.value))
                  }
                  disabled={isSaving}
                  size={Math.min(6, Math.max(3, allGuards.length))}
                  className={selectClassName}
                >
                  {allGuards.map((guard) => (
                    <option key={guard.pulp_href} value={guard.pulp_href}>
                      {guard.name}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}
            {kind === "core.rbac" ? (
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Users and groups
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Derived from role assignments. Use the Access panel to grant or revoke the
                  download role for this guard.
                </p>
                <div className="mt-2 flex flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                  {(detail?.users?.length ?? 0) === 0 && (detail?.groups?.length ?? 0) === 0 ? (
                    <p>No users or groups assigned.</p>
                  ) : (
                    <>
                      {detail?.users?.map((user) => (
                        <p key={user.pulp_href}>User: {user.username}</p>
                      ))}
                      {detail?.groups?.map((group) => (
                        <p key={group.pulp_href}>Group: {group.name}</p>
                      ))}
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={isSaving} onClick={close}>
            Cancel
          </Button>
          <Button type="button" disabled={isSaving || isLoading} onClick={() => void handleSave()}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
