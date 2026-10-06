/**
 * Content-list-only filters for GET /content/ (repository version scopes and
 * content type).
 *
 * Like lib/task-list-filters.ts, this gives app/content/list/page.tsx a pure
 * read/write-URL/build-request-params shape so the filters survive a reload and
 * can be preselected by a link. The URL param names are identical to Pulp's own
 * param names, so a link such as
 * /content/list?repository_version_added=<href>&pulp_type=rpm.package is
 * self-explanatory.
 */

export type PulpContentFilters = {
  repositoryVersion: string;
  repositoryVersionAdded: string;
  repositoryVersionRemoved: string;
  pulpType: string;
};

export const DEFAULT_PULP_CONTENT_FILTERS: PulpContentFilters = {
  repositoryVersion: "",
  repositoryVersionAdded: "",
  repositoryVersionRemoved: "",
  pulpType: "",
};

/** Applies the content filters to a Pulp GET /content/ request's query params, in place. */
export function applyPulpContentFilters(params: URLSearchParams, filters: PulpContentFilters): void {
  if (filters.repositoryVersion) {
    params.set("repository_version", filters.repositoryVersion);
  }
  if (filters.repositoryVersionAdded) {
    params.set("repository_version_added", filters.repositoryVersionAdded);
  }
  if (filters.repositoryVersionRemoved) {
    params.set("repository_version_removed", filters.repositoryVersionRemoved);
  }
  if (filters.pulpType) {
    params.set("pulp_type", filters.pulpType);
  }
}

/** Reads a PulpContentFilters out of the browser URL's query params, falling back to defaults. */
export function parsePulpContentFilters(params: URLSearchParams): PulpContentFilters {
  return {
    repositoryVersion:
      params.get("repository_version") ?? DEFAULT_PULP_CONTENT_FILTERS.repositoryVersion,
    repositoryVersionAdded:
      params.get("repository_version_added") ?? DEFAULT_PULP_CONTENT_FILTERS.repositoryVersionAdded,
    repositoryVersionRemoved:
      params.get("repository_version_removed") ??
      DEFAULT_PULP_CONTENT_FILTERS.repositoryVersionRemoved,
    pulpType: params.get("pulp_type") ?? DEFAULT_PULP_CONTENT_FILTERS.pulpType,
  };
}

/**
 * Inverse of parsePulpContentFilters: the browser-URL params for a set of
 * content filters, in the record shape usePulpListQuery's setExtraParams takes.
 * Every key is always present; a filter left at its default is the empty
 * string, which deletes the param.
 */
export function pulpContentFiltersToUrlParams(filters: PulpContentFilters): Record<string, string> {
  return {
    repository_version: filters.repositoryVersion,
    repository_version_added: filters.repositoryVersionAdded,
    repository_version_removed: filters.repositoryVersionRemoved,
    pulp_type: filters.pulpType,
  };
}

const REPOSITORY_VERSION_HREF_SHAPE = /^(.*\/repositories\/[^/]+\/[^/]+\/[^/]+\/)versions\/(\d+)\/?$/;

/**
 * Splits a repository version href (".../repositories/<type>/<type>/<uuid>/versions/<n>/")
 * into the owning repository's href and the version number, or null when the
 * value is not a version href.
 */
export function parseRepositoryVersionHref(
  href: string
): { repositoryHref: string; versionNumber: number } | null {
  const match = REPOSITORY_VERSION_HREF_SHAPE.exec(href);
  if (!match) return null;
  return { repositoryHref: match[1], versionNumber: Number(match[2]) };
}

export type ContentSummaryBucketName = "added" | "removed" | "present";

/**
 * The /content/list link for one content_summary entry: the bucket picks which
 * version param carries the version href, and the entry key is the pulp_type.
 */
export function contentSummaryLink(
  versionHref: string,
  bucket: ContentSummaryBucketName,
  pulpType: string
): string {
  const params = pulpContentFiltersToUrlParams({
    ...DEFAULT_PULP_CONTENT_FILTERS,
    repositoryVersion: bucket === "present" ? versionHref : "",
    repositoryVersionAdded: bucket === "added" ? versionHref : "",
    repositoryVersionRemoved: bucket === "removed" ? versionHref : "",
    pulpType,
  });
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  return `/content/list?${search.toString()}`;
}

/**
 * The line shown above the content table when a version scope is in the URL
 * (e.g. "Content added in my-repo version 3 (rpm.package)"), or null when no
 * version scope is set. repositoryName is the resolved name of the scope's
 * repository, or null to fall back to the raw version href.
 */
export function describeContentVersionScope(
  filters: PulpContentFilters,
  repositoryName: string | null
): string | null {
  const scopes: Array<[string, string]> = [
    ["added in", filters.repositoryVersionAdded],
    ["removed in", filters.repositoryVersionRemoved],
    ["present in", filters.repositoryVersion],
  ];
  const scope = scopes.find(([, href]) => href !== "");
  if (!scope) return null;
  const [verb, href] = scope;
  const parsed = parseRepositoryVersionHref(href);
  const where =
    parsed && repositoryName !== null ? `${repositoryName} version ${parsed.versionNumber}` : href;
  const type = filters.pulpType ? ` (${filters.pulpType})` : "";
  return `Content ${verb} ${where}${type}`;
}
