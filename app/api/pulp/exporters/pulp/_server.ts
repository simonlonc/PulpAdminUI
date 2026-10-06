import { decodeRefOrNull } from "@/app/api/pulp/_helpers";

const PULP_EXPORTERS_PATH = "/exporters/core/pulp/";

/**
 * Resolves a URI-encoded pulp_href (absolute or relative) to a trailing-slash path under
 * /exporters/core/pulp/, or null for anything else. Dot-segments are collapsed before the
 * allowlist check, so `/exporters/core/pulp/../../users/` cannot walk out of the exporters tree.
 */
function resolveExportersTreePath(encodedRef: string): string | null {
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

  const exportersIndex = pathname.indexOf(PULP_EXPORTERS_PATH);
  if (exportersIndex === -1) {
    return null;
  }

  const normalizedPath = pathname.slice(exportersIndex);
  return normalizedPath.endsWith("/") ? normalizedPath : `${normalizedPath}/`;
}

/** `{pulp_exporter_href}`; an export href under it is not an exporter and is refused. */
export function resolvePulpExporterPath(encodedRef: string): string | null {
  const exporterPath = resolveExportersTreePath(encodedRef);
  return exporterPath !== null && !exporterPath.includes("/exports/") ? exporterPath : null;
}

/** `{pulp_pulp_export_href}`, i.e. `{pulp_exporter_href}exports/{id}/`. */
export function resolvePulpExportPath(encodedRef: string): string | null {
  const exportPath = resolveExportersTreePath(encodedRef);
  return exportPath !== null && exportPath.includes("/exports/") ? exportPath : null;
}
