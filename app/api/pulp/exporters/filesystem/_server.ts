import { decodeRefOrNull } from "@/app/api/pulp/_helpers";

const FILESYSTEM_EXPORTERS_PATH = "/exporters/core/filesystem/";

/**
 * Resolves a URI-encoded pulp_href (absolute or relative) to a trailing-slash path under
 * /exporters/core/filesystem/, or null for anything else. Dot-segments are collapsed before the
 * allowlist check, so `/exporters/core/filesystem/../../users/` cannot walk out of the
 * filesystem exporters tree.
 */
function resolveFilesystemExportersTreePath(encodedRef: string): string | null {
  const decodedRef = decodeRefOrNull(encodedRef);
  if (!decodedRef) {
    return null;
  }
  if (!decodedRef.startsWith("/") && !/^https?:\/\//i.test(decodedRef)) {
    return null;
  }

  let pathname: string;
  try {
    pathname = new URL(decodedRef, "http://x").pathname;
  } catch {
    return null;
  }

  const exportersIndex = pathname.indexOf(FILESYSTEM_EXPORTERS_PATH);
  if (exportersIndex === -1) {
    return null;
  }

  const normalizedPath = pathname.slice(exportersIndex);
  return normalizedPath.endsWith("/") ? normalizedPath : `${normalizedPath}/`;
}

/** `{filesystem_exporter_href}`; an export href under it is not an exporter and is refused. */
export function resolveFilesystemExporterPath(encodedRef: string): string | null {
  const exporterPath = resolveFilesystemExportersTreePath(encodedRef);
  return exporterPath !== null && !exporterPath.includes("/exports/") ? exporterPath : null;
}

/** `{filesystem_filesystem_export_href}`, i.e. `{filesystem_exporter_href}exports/{id}/`. */
export function resolveFilesystemExportPath(encodedRef: string): string | null {
  const exportPath = resolveFilesystemExportersTreePath(encodedRef);
  return exportPath !== null && exportPath.includes("/exports/") ? exportPath : null;
}
