import Link from "next/link";
import { contentSummaryLink, type ContentSummaryBucketName } from "@/lib/content-list-filters";
import type {
  PulpRepositoryVersion,
  PulpRepositoryVersionContentKind,
} from "@/services/pulp/types";

function SummaryBucket({
  bucket,
  bucketName,
  versionHref,
}: {
  bucket: Record<string, PulpRepositoryVersionContentKind>;
  bucketName: ContentSummaryBucketName;
  versionHref: string;
}) {
  const keys = Object.keys(bucket);
  if (keys.length === 0) {
    return <span className="text-zinc-400">—</span>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {keys.map((k) => (
        <li key={k}>
          <span className="font-mono text-zinc-800 dark:text-zinc-200">{k}</span>
          <span className="mx-1 text-zinc-400">×</span>
          {bucket[k].count > 0 ? (
            <Link
              href={contentSummaryLink(versionHref, bucketName, k)}
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              {bucket[k].count}
            </Link>
          ) : (
            <span>{bucket[k].count}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function RepositoryVersionSummary({ version }: { version: PulpRepositoryVersion }) {
  const s = version.content_summary;
  return (
    <div className="grid min-w-[12rem] gap-3 sm:grid-cols-3">
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Added</p>
        <SummaryBucket bucket={s.added} bucketName="added" versionHref={version.pulp_href} />
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Removed</p>
        <SummaryBucket bucket={s.removed} bucketName="removed" versionHref={version.pulp_href} />
      </div>
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Present</p>
        <SummaryBucket bucket={s.present} bucketName="present" versionHref={version.pulp_href} />
      </div>
    </div>
  );
}
