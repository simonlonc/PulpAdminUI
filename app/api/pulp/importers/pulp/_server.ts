import { decodeRefOrNull, PulpApiError } from "@/app/api/pulp/_helpers";

const PULP_IMPORTERS_PATH = "/importers/core/pulp/";

/** `/importers/core/pulp/{id}/`, where `import-check` (the pre-flight route) is not an id. */
const IMPORTER_PATH_PATTERN = /^\/importers\/core\/pulp\/(?!import-check\/)[^/]+\/$/;

/** `/importers/core/pulp/{id}/imports/{id}/`. */
const IMPORT_PATH_PATTERN = /^\/importers\/core\/pulp\/(?!import-check\/)[^/]+\/imports\/[^/]+\/$/;

/**
 * Resolves a URI-encoded pulp_href (absolute or relative) to a trailing-slash path under
 * /importers/core/pulp/, or null for anything else. Dot-segments are collapsed before the
 * allowlist check, so `/importers/core/pulp/../../users/` cannot walk out of the importers tree.
 */
function resolveImportersTreePath(encodedRef: string): string | null {
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

  const importersIndex = pathname.indexOf(PULP_IMPORTERS_PATH);
  if (importersIndex === -1) {
    return null;
  }

  const normalizedPath = pathname.slice(importersIndex);
  return normalizedPath.endsWith("/") ? normalizedPath : `${normalizedPath}/`;
}

/** `{pulp_importer_href}`; an import href under it, the import-check route and the collection itself are refused. */
export function resolvePulpImporterPath(encodedRef: string): string | null {
  const importerPath = resolveImportersTreePath(encodedRef);
  return importerPath !== null && IMPORTER_PATH_PATTERN.test(importerPath) ? importerPath : null;
}

/** `{pulp_pulp_import_href}`, i.e. `{pulp_importer_href}imports/{id}/`. */
export function resolvePulpImportPath(encodedRef: string): string | null {
  const importPath = resolveImportersTreePath(encodedRef);
  return importPath !== null && IMPORT_PATH_PATTERN.test(importPath) ? importPath : null;
}

/**
 * Reads the optional `repo_mapping` off an already-parsed request body: a plain object of
 * repository name inside the export -> repository name in this Pulp. Keys and values are trimmed
 * and a pair with either side empty is dropped (Pulp rejects an empty name). Returns undefined when
 * the field is absent. Throws `PulpApiError(400, ...)` for anything that is not an object of strings.
 */
export function readRepoMappingField(body: Record<string, unknown>): Record<string, string> | undefined {
  const value = body.repo_mapping;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PulpApiError(400, "repo_mapping must be an object of repository names.");
  }

  const pairs: [string, string][] = [];
  for (const [exportName, localName] of Object.entries(value)) {
    if (typeof localName !== "string") {
      throw new PulpApiError(400, "repo_mapping must be an object of repository names.");
    }
    if (exportName.trim() && localName.trim()) {
      pairs.push([exportName.trim(), localName.trim()]);
    }
  }
  return Object.fromEntries(pairs);
}
