import type { PulpExport } from "@/services/pulp/types";

/**
 * Pure helpers for the files manifest of a Pulp export (`output_file_info` / `toc_info`), so the
 * exporters page can show it plainly and the labelling can be unit-tested without rendering.
 */

export type ExportChecksumAlgorithm = "sha256" | "crc32" | "checksum";

export type ExportManifestEntry = {
  /** Absolute path on the Pulp host, exactly as Pulp reports it. */
  path: string;
  basename: string;
  checksum: string;
  algorithm: ExportChecksumAlgorithm;
  /** True for the table-of-contents file (`toc_info.file`). */
  isToc: boolean;
};

/**
 * Pulp does not name the checksum algorithm, and it differs per file on 3.119: crc32 (8 hex
 * characters) for the archive and sha256 (64) for the table of contents. The algorithm is
 * therefore read off the digest length; anything else is just "checksum", never assumed sha256.
 */
export function exportChecksumAlgorithm(digest: string): ExportChecksumAlgorithm {
  const value = digest.trim();
  if (/^[0-9a-f]{64}$/i.test(value)) {
    return "sha256";
  }
  if (/^[0-9a-f]{8}$/i.test(value)) {
    return "crc32";
  }
  return "checksum";
}

/** The last path segment, or the whole string when there is no "/" in it. */
export function exportFileBasename(path: string): string {
  const segments = path.split("/").filter((segment) => segment.length > 0);
  return segments.length > 0 ? segments[segments.length - 1] : path;
}

/** One entry per `output_file_info` key, in Pulp's order. Pulp leaves it null when no file was written. */
export function exportManifestEntries(
  exportRow: Pick<PulpExport, "output_file_info" | "toc_info">
): ExportManifestEntry[] {
  return Object.entries(exportRow.output_file_info ?? {}).map(([path, checksum]) => ({
    path,
    basename: exportFileBasename(path),
    checksum,
    algorithm: exportChecksumAlgorithm(checksum),
    isToc: path === exportRow.toc_info?.file,
  }));
}

/** "full, dry run, chunk size 500MB" from an export's `params`; empty when none of them is present. */
export function exportParamsSummary(params: PulpExport["params"] | null | undefined): string {
  const parts: string[] = [];
  if (typeof params?.full === "boolean") {
    parts.push(params.full ? "full" : "incremental");
  }
  if (params?.dry_run === true) {
    parts.push("dry run");
  }
  if (typeof params?.chunk_size === "string" && params.chunk_size) {
    parts.push(`chunk size ${params.chunk_size}`);
  }
  return parts.join(", ");
}
