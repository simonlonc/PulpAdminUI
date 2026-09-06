"use client";

import Link from "next/link";
import { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { ChecksumSelect } from "./checksum-select";
import { RemoteSelect } from "./remote-select";
import type { PulpRemote, RepositoryUpdatePayload } from "@/services/pulp/types";

const textareaClass =
  "min-h-[5rem] w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

const selectClass =
  "w-full max-w-md rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export type RepositoryEditRpmFormProps = {
  value: RepositoryUpdatePayload;
  onChange: (value: RepositoryUpdatePayload) => void;
  remotes: PulpRemote[];
  pulpHref: string;
  canOnRepo: (href: string, verb: string) => boolean;
  isSubmitting: boolean;
  saveAlsoPublish: boolean;
  setSaveAlsoPublish: (value: boolean) => void;
  saveAlsoDistribute: boolean;
  setSaveAlsoDistribute: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function RepositoryEditRpmForm({
  value: rpm,
  onChange: setRpm,
  remotes: rpmRemotes,
  pulpHref,
  canOnRepo,
  isSubmitting,
  saveAlsoPublish,
  setSaveAlsoPublish,
  saveAlsoDistribute,
  setSaveAlsoDistribute,
  onSubmit,
}: RepositoryEditRpmFormProps) {
  return (
    <form className="flex max-w-2xl flex-col gap-4" onSubmit={onSubmit}>
      <FormField label="Name">
        <Input
          value={rpm.name}
          onChange={(e) => setRpm({ ...rpm, name: e.target.value })}
          required
        />
      </FormField>
      <FormField label="Description">
        <textarea
          className={textareaClass}
          value={rpm.description ?? ""}
          onChange={(e) =>
            setRpm({
              ...rpm,
              description: e.target.value === "" ? null : e.target.value,
            })
          }
          rows={3}
        />
      </FormField>
      <FormField
        label={
          <span className="inline-flex items-center gap-1.5">
            Retain repository versions
            <InfoTooltip text="Caps how many historical repository versions Pulp keeps. Older versions beyond this number are pruned automatically on the next publish. Doesn't remove packages still present in the latest version." />
          </span>
        }
      >
        <Input
          type="number"
          min={0}
          placeholder="empty = no limit"
          value={rpm.retain_repo_versions === null ? "" : rpm.retain_repo_versions}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") {
              setRpm({ ...rpm, retain_repo_versions: null });
              return;
            }
            const n = Number(v);
            setRpm({
              ...rpm,
              retain_repo_versions: Number.isFinite(n) ? Math.trunc(n) : null,
            });
          }}
        />
      </FormField>
      <FormField label="Remote (Pulp href)">
        <RemoteSelect
          value={rpm.remote}
          remotes={rpmRemotes}
          onChange={(v) => setRpm({ ...rpm, remote: v })}
        />
      </FormField>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={rpm.autopublish}
          onChange={(e) => setRpm({ ...rpm, autopublish: e.target.checked })}
        />
        Autopublish
      </label>
      <FormField label="Metadata signing service (href)">
        <Input
          value={rpm.metadata_signing_service ?? ""}
          onChange={(e) =>
            setRpm({
              ...rpm,
              metadata_signing_service:
                e.target.value.trim() === "" ? null : e.target.value.trim(),
            })
          }
          className="font-mono text-xs"
        />
      </FormField>
      <FormField
        label={
          <span className="inline-flex items-center gap-1.5">
            Retain package versions
            <InfoTooltip text="Keeps only the N most recent builds of each package (by NEVRA) in the latest repository version. Set to 1 to keep just the newest build of every package. 0 = keep all. Applies the next time a repository version is created, e.g. via publish." />
          </span>
        }
      >
        <Input
          type="number"
          min={0}
          value={rpm.retain_package_versions}
          onChange={(e) => {
            const n = Number(e.target.value);
            setRpm({
              ...rpm,
              retain_package_versions:
                Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0,
            });
          }}
        />
      </FormField>
      <ChecksumSelect
        label="Metadata checksum type"
        value={rpm.metadata_checksum_type ?? null}
        onChange={(v) => setRpm({ ...rpm, metadata_checksum_type: v })}
      />
      <ChecksumSelect
        label="Package checksum type"
        value={rpm.package_checksum_type ?? null}
        onChange={(v) => setRpm({ ...rpm, package_checksum_type: v })}
      />
      <FormField label="GPG check (0 or 1)">
        <select
          className={selectClass}
          value={rpm.gpgcheck ? 1 : 0}
          onChange={(e) =>
            setRpm({ ...rpm, gpgcheck: e.target.value === "1" ? 1 : 0 })
          }
        >
          <option value={0}>0</option>
          <option value={1}>1</option>
        </select>
      </FormField>
      <FormField label="Repo GPG check (0 or 1)">
        <select
          className={selectClass}
          value={rpm.repo_gpgcheck ? 1 : 0}
          onChange={(e) =>
            setRpm({ ...rpm, repo_gpgcheck: e.target.value === "1" ? 1 : 0 })
          }
        >
          <option value={0}>0</option>
          <option value={1}>1</option>
        </select>
      </FormField>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={rpm.sqlite_metadata}
          onChange={(e) => setRpm({ ...rpm, sqlite_metadata: e.target.checked })}
        />
        SQLite metadata
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
          <InfoTooltip text="Creates a new repository version right after save, which is what actually applies retain_repo_versions / retain_package_versions pruning. Without this, changed retention settings only take effect on the next publish." />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={saveAlsoDistribute}
            onChange={(e) => setSaveAlsoDistribute(e.target.checked)}
          />
          Create or update RPM distribution
        </label>
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
