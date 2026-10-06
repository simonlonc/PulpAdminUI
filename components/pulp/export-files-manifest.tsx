import { Badge } from "@/components/ui/badge";
import { exportManifestEntries } from "@/lib/pulp-export-manifest";
import { PulpExport } from "@/services/pulp/types";

export type ExportFilesManifestProps = {
  exportRow: Pick<PulpExport, "output_file_info" | "toc_info">;
};

/**
 * The files an export wrote on the Pulp host, with the checksum to verify each one with after the
 * bundle is copied elsewhere. Always shown in full: this manifest is what an operator checks the
 * copy against, so it is not hidden behind a tooltip or a toggle.
 */
export function ExportFilesManifest({ exportRow }: ExportFilesManifestProps) {
  const entries = exportManifestEntries(exportRow);

  if (entries.length === 0) {
    return <p className="text-xs text-zinc-500">No files recorded for this export.</p>;
  }

  return (
    <ul aria-label="Exported files" className="space-y-2">
      {entries.map((entry) => (
        <li key={entry.path} className="text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{entry.basename}</span>
            {entry.isToc ? <Badge variant="outline">TOC</Badge> : null}
          </p>
          <p className="break-all font-mono text-xs text-zinc-500">{entry.path}</p>
          <p className="break-all font-mono text-xs">
            <span className="text-zinc-500">{entry.algorithm}</span> {entry.checksum}
          </p>
        </li>
      ))}
    </ul>
  );
}
