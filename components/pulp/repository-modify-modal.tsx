"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckboxField, FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { usePulpPluginsContext } from "./plugins-context";
import type { PulpPluginKind } from "@/lib/pulp-plugins";
import { pulpRepositoryManagementService } from "@/services/pulp/repository-management-service";

const textareaClass =
  "min-h-[7rem] w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 font-mono text-xs dark:border-zinc-700";

function linesFromTextarea(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export type RepositoryModifyModalProps = {
  kind: PulpPluginKind;
  repositoryHref: string;
  onClose: () => void;
  onSaved: () => void;
};

export function RepositoryModifyModal({
  kind,
  repositoryHref,
  onClose,
  onSaved,
}: RepositoryModifyModalProps) {
  const { getPlugin } = usePulpPluginsContext();
  const plugin = getPlugin(kind);
  const [addUnits, setAddUnits] = useState("");
  const [removeUnits, setRemoveUnits] = useState("");
  const [overwrite, setOverwrite] = useState(true);
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

  function close() {
    if (isSaving) return;
    onClose();
  }

  async function handleSave() {
    setModalError(null);

    const addContentUnits = linesFromTextarea(addUnits);
    const removeContentUnits = linesFromTextarea(removeUnits);
    if (addContentUnits.length === 0 && removeContentUnits.length === 0) {
      setModalError("Add at least one content unit href to add or remove.");
      return;
    }

    setIsSaving(true);
    try {
      const result = await pulpRepositoryManagementService.modifyRepository(kind, repositoryHref, {
        add_content_units: addContentUnits,
        remove_content_units: removeContentUnits,
        overwrite,
      });
      if (!result.ok) {
        throw new Error(result.detail);
      }
      onSaved();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Modify failed.");
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
          Modify content
        </h2>
        <p className="mt-1 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {repositoryHref}
        </p>

        {modalError ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
          >
            {modalError}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-3">
          <FormField
            label={
              <span className="inline-flex items-center gap-1.5">
                Add content units
                <InfoTooltip text={`Content unit hrefs to add, one per line. Copy hrefs from the content list or the ${plugin.label} repository content page.`} />
              </span>
            }
          >
            <textarea
              className={textareaClass}
              value={addUnits}
              onChange={(event) => setAddUnits(event.target.value)}
              disabled={isSaving}
              placeholder={"/pulp/api/v3/content/rpm/packages/.../"}
            />
          </FormField>
          <FormField
            label={
              <span className="inline-flex items-center gap-1.5">
                Remove content units
                <InfoTooltip text="Content unit hrefs to remove, one per line. Enter a single * to remove all content from the new version." />
              </span>
            }
          >
            <textarea
              className={textareaClass}
              value={removeUnits}
              onChange={(event) => setRemoveUnits(event.target.value)}
              disabled={isSaving}
              placeholder={"/pulp/api/v3/content/rpm/packages/.../\nor a single * to remove all content"}
            />
          </FormField>
          <CheckboxField
            label={
              <span className="inline-flex items-center gap-1.5">
                Overwrite
                <InfoTooltip text="When checked (default), added content may overwrite existing content with the same unique key. When unchecked, the task fails instead of overwriting." />
              </span>
            }
          >
            <Input
              type="checkbox"
              className="h-4 w-4 rounded border-zinc-300 p-0 dark:border-zinc-700"
              checked={overwrite}
              onChange={(event) => setOverwrite(event.target.checked)}
              disabled={isSaving}
            />
          </CheckboxField>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={isSaving} onClick={close}>
            Cancel
          </Button>
          <Button type="button" disabled={isSaving} onClick={() => void handleSave()}>
            {isSaving ? "Applying…" : "Apply"}
          </Button>
        </div>
      </div>
    </div>
  );
}
