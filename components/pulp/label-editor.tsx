"use client";

import { useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { pulpLabelService } from "@/services/pulp/label-service";

const LABEL_KEY_PATTERN = /^[A-Za-z0-9_ .-]+$/;

export type LabelChipsProps = { labels: Record<string, string> };

export function LabelChips({ labels }: LabelChipsProps) {
  const entries = Object.entries(labels);

  if (entries.length === 0) {
    return <span className="text-xs text-zinc-500 dark:text-zinc-400">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([key, value]) => (
        <Badge key={key} variant="outline">
          {key}={value}
        </Badge>
      ))}
    </div>
  );
}

type LabelRow = { key: string; value: string };

function rowsFromLabels(labels: Record<string, string>): LabelRow[] {
  return Object.entries(labels).map(([key, value]) => ({ key, value }));
}

export type LabelEditorModalProps = {
  pulpHref: string;
  resourceName: string;
  labels: Record<string, string>;
  onClose: () => void;
  onSaved: (labels: Record<string, string>) => void;
};

export function LabelEditorModal({
  pulpHref,
  resourceName,
  labels,
  onClose,
  onSaved,
}: LabelEditorModalProps) {
  const [rows, setRows] = useState<LabelRow[]>(() => rowsFromLabels(labels));
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const titleId = useId();

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

  function updateRow(index: number, patch: Partial<LabelRow>) {
    setModalError(null);
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setModalError(null);
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addRow() {
    setModalError(null);
    setRows((prev) => [...prev, { key: "", value: "" }]);
  }

  function close() {
    if (isSaving) return;
    onClose();
  }

  async function handleSave() {
    const seen = new Set<string>();
    for (const row of rows) {
      const key = row.key.trim();
      if (!key) {
        setModalError("Every label needs a key.");
        return;
      }
      if (!LABEL_KEY_PATTERN.test(key)) {
        setModalError(`Key "${key}" may only contain letters, numbers, underscores, spaces, hyphens and dots.`);
        return;
      }
      if (seen.has(key)) {
        setModalError(`Duplicate key "${key}".`);
        return;
      }
      seen.add(key);
    }

    const nextMap: Record<string, string> = {};
    for (const row of rows) {
      nextMap[row.key.trim()] = row.value;
    }

    setModalError(null);
    setIsSaving(true);
    try {
      const result = await pulpLabelService.saveLabels(pulpHref, labels, nextMap);
      if (!result.ok) {
        setModalError(result.detail);
        return;
      }
      onSaved(nextMap);
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
          Edit labels
        </h2>
        <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">{resourceName}</p>

        {modalError ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
          >
            {modalError}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-3">
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No labels yet.</p>
          ) : null}
          {rows.map((row, index) => (
            <div key={index} className="flex items-end gap-2">
              <FormField label="Key" className="flex-1">
                <Input
                  value={row.key}
                  onChange={(event) => updateRow(index, { key: event.target.value })}
                  disabled={isSaving}
                  className="font-mono"
                />
              </FormField>
              <FormField label="Value" className="flex-1">
                <Input
                  value={row.value}
                  onChange={(event) => updateRow(index, { value: event.target.value })}
                  disabled={isSaving}
                  className="font-mono"
                />
              </FormField>
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => removeRow(index)}
                aria-label={`Remove label ${row.key || index + 1}`}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" disabled={isSaving} onClick={addRow} className="self-start">
            Add label
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={isSaving} onClick={close}>
            Cancel
          </Button>
          <Button type="button" disabled={isSaving} onClick={() => void handleSave()}>
            {isSaving ? "Saving…" : "Save labels"}
          </Button>
        </div>
      </div>
    </div>
  );
}
