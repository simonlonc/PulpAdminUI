"use client";

import Link from "next/link";
import { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { RemoteSelect } from "./remote-select";
import type { PulpRemote, RepositoryUpdatePayload } from "@/services/pulp/types";

const textareaClass =
  "min-h-[5rem] w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export type RepositoryEditDebFormProps = {
  value: RepositoryUpdatePayload;
  onChange: (value: RepositoryUpdatePayload) => void;
  remotes: PulpRemote[];
  pulpHref: string;
  canOnRepo: (href: string, verb: string) => boolean;
  isSubmitting: boolean;
  saveAlsoPublish: boolean;
  setSaveAlsoPublish: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function RepositoryEditDebForm({
  value: deb,
  onChange: setDeb,
  remotes: debRemotes,
  pulpHref,
  canOnRepo,
  isSubmitting,
  saveAlsoPublish,
  setSaveAlsoPublish,
  onSubmit,
}: RepositoryEditDebFormProps) {
  return (
    <form className="flex max-w-lg flex-col gap-4" onSubmit={onSubmit}>
      <FormField label="Name">
        <Input
          value={deb.name}
          onChange={(e) => setDeb({ ...deb, name: e.target.value })}
          required
        />
      </FormField>
      <FormField label="Description">
        <textarea
          className={textareaClass}
          value={deb.description ?? ""}
          onChange={(e) =>
            setDeb({
              ...deb,
              description: e.target.value === "" ? null : e.target.value,
            })
          }
          rows={3}
        />
      </FormField>
      <FormField label="Retain repository versions">
        <Input
          type="number"
          min={0}
          placeholder="empty = no limit"
          value={deb.retain_repo_versions === null ? "" : deb.retain_repo_versions}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") {
              setDeb({ ...deb, retain_repo_versions: null });
              return;
            }
            const n = Number(v);
            setDeb({
              ...deb,
              retain_repo_versions: Number.isFinite(n) ? Math.trunc(n) : null,
            });
          }}
        />
      </FormField>
      <FormField label="Remote (Pulp href)">
        <RemoteSelect
          value={deb.remote}
          remotes={debRemotes}
          onChange={(v) => setDeb({ ...deb, remote: v })}
        />
      </FormField>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={deb.autopublish}
          onChange={(e) => setDeb({ ...deb, autopublish: e.target.checked })}
        />
        Autopublish
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={deb.structured_repo}
          onChange={(e) => setDeb({ ...deb, structured_repo: e.target.checked })}
        />
        Structured repo
      </label>
      <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          After save
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={saveAlsoPublish}
            onChange={(e) => setSaveAlsoPublish(e.target.checked)}
          />
          Publish repository
        </label>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          RPM-only: create a distribution from the repository list or edit page for RPM repos.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting || !canOnRepo(pulpHref, "change")}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
        <Link
          href="/repositories/list"
          className="inline-flex items-center rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Back to list
        </Link>
        <Link
          href={`/repositories/content?pulp_href=${encodeURIComponent(pulpHref)}`}
          className="inline-flex items-center rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Content
        </Link>
      </div>
    </form>
  );
}
