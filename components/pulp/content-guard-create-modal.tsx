"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { pulpContentGuardService } from "@/services/pulp/content-guard-service";
import { PULP_CONTENT_GUARD_KINDS } from "@/services/pulp/content-guard-kinds";
import { CreatePulpContentGuardPayload, PulpContentGuard, PulpContentGuardKind } from "@/services/pulp/types";

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

const textareaClass =
  "min-h-[7rem] w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 font-mono text-xs dark:border-zinc-700";

export type ContentGuardCreateModalProps = {
  onClose: () => void;
  onCreated: () => void;
};

export function ContentGuardCreateModal({ onClose, onCreated }: ContentGuardCreateModalProps) {
  const [contentGuards, setContentGuards] = useState<PulpContentGuard[]>([]);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const titleId = useId();

  const [kind, setKind] = useState<PulpContentGuardKind>(PULP_CONTENT_GUARD_KINDS[0].kind);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [headerName, setHeaderName] = useState("");
  const [headerValue, setHeaderValue] = useState("");
  const [jqFilter, setJqFilter] = useState("");
  const [caCertificate, setCaCertificate] = useState("");
  const [guards, setGuards] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const page = await pulpContentGuardService.list(
          new URLSearchParams({ limit: "200", offset: "0" })
        );
        if (active) {
          setContentGuards(page.results);
        }
      } catch (error) {
        if (active) {
          setModalError(
            error instanceof Error ? error.message : "Failed to load content guards."
          );
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

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

  async function handleCreate() {
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

    const payload: CreatePulpContentGuardPayload = {
      kind,
      name: trimmedName,
    };
    const trimmedDescription = description.trim();
    if (trimmedDescription) {
      payload.description = trimmedDescription;
    }
    if (kind === "core.header") {
      payload.header_name = headerName.trim();
      payload.header_value = headerValue;
      if (jqFilter.trim()) {
        payload.jq_filter = jqFilter.trim();
      }
    } else if (kind === "certguard.x509" || kind === "certguard.rhsm") {
      payload.ca_certificate = caCertificate;
    } else if (kind === "core.composite") {
      payload.guards = guards;
    }

    setIsSaving(true);
    try {
      const result = await pulpContentGuardService.create(payload);
      if (!result.ok) {
        throw new Error(result.detail);
      }
      onCreated();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Failed to create content guard.");
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
          New content guard
        </h2>

        {modalError ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
          >
            {modalError}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-3">
          <FormField label="Type">
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as PulpContentGuardKind)}
              disabled={isSaving}
              className={selectClassName}
            >
              {PULP_CONTENT_GUARD_KINDS.map((descriptor) => (
                <option key={descriptor.kind} value={descriptor.kind}>
                  {descriptor.label}
                </option>
              ))}
            </select>
          </FormField>
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
                placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
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
                size={Math.min(6, Math.max(3, contentGuards.length))}
                className={selectClassName}
              >
                {contentGuards.map((guard) => (
                  <option key={guard.pulp_href} value={guard.pulp_href}>
                    {guard.name}
                  </option>
                ))}
              </select>
            </FormField>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={isSaving} onClick={close}>
            Cancel
          </Button>
          <Button type="button" disabled={isSaving} onClick={() => void handleCreate()}>
            {isSaving ? "Creating…" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  );
}
