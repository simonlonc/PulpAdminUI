import { PulpResourceFamily } from "@/lib/pulp-resource-ref";

export type ApiErrorResponse = {
  detail?: string;
};

export type ServiceResult =
  | { ok: true }
  | {
      ok: false;
      detail: string;
    };

/** Like ServiceResult, but the success case carries the mutation's response payload. */
export type ServiceDataResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      detail: string;
    };

export type PulpUser = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  is_staff: boolean;
  is_active: boolean;
};

export type PulpGroup = {
  id: number;
  name: string;
};

/** Matches OpenAPI components/schemas/RoleResponse (openapi/pulp.json). */
export type PulpRole = {
  pulp_href: string;
  prn?: string;
  pulp_created: string;
  pulp_last_updated?: string;
  name: string;
  description: string | null;
  permissions: string[];
  locked: boolean;
};

export type CreatePulpRolePayload = {
  name: string;
  description?: string;
  permissions: string[];
};

export type UpdatePulpRolePayload = {
  name?: string;
  description?: string | null;
  permissions?: string[];
};

export type PutPulpRolePayload = {
  name: string;
  description?: string | null;
  permissions: string[];
};

/** One row of GET {href}list_roles/ — users/groups are usernames/group names, not hrefs. */
export type PulpObjectRole = {
  role: string;
  users: string[];
  groups: string[];
};

/** Body for POST {href}add_role/ and POST {href}remove_role/. */
export type PulpObjectRoleAssignmentPayload = {
  role: string;
  users: string[];
  groups: string[];
};

/** Worker name from Pulp may include HTML (e.g. mailto links). */
export type PulpWorker = {
  pulp_href: string;
  pulp_created: string;
  name: string;
  last_heartbeat: string;
  current_task: string | null;
};

export type PulpTaskProgressReport = {
  message: string;
  code: string;
  state: string;
  total: number;
  done: number;
  suffix: string | null;
};

export type PulpTask = {
  pulp_href: string;
  pulp_created: string;
  state: string;
  name: string;
  logging_cid: string;
  started_at: string | null;
  finished_at: string | null;
  error: unknown;
  worker: string | null;
  parent_task: string | null;
  child_tasks: string[];
  task_group: string | null;
  progress_reports: PulpTaskProgressReport[];
  created_resources: string[];
  reserved_resources_record: string[];
};

/** Task states accepted by POST /tasks/purge/ (OpenAPI components/schemas/StatesEnum). */
export type PulpTaskPurgeState = "skipped" | "completed" | "failed" | "canceled";

export type PulpTaskPurgePayload = {
  finished_before: string;
  states: PulpTaskPurgeState[];
};

export type PulpTaskPurgeResult = {
  task: string;
  state: string;
  progress_reports: PulpTaskProgressReport[];
};

/** Group progress reports have no state, unlike task progress reports. */
export type PulpTaskGroupProgressReport = {
  message: string;
  code: string;
  total: number;
  done: number;
  suffix: string | null;
};

/** Matches OpenAPI components/schemas/MinimalTaskResponse. */
export type PulpTaskGroupTask = {
  pulp_href: string;
  name: string;
  state: string;
  started_at: string | null;
  finished_at: string | null;
  worker: string | null;
};

export type PulpTaskGroup = {
  pulp_href: string;
  description: string;
  all_tasks_dispatched: boolean;
  waiting: number;
  skipped: number;
  running: number;
  completed: number;
  canceled: number;
  failed: number;
  canceling: number;
  group_progress_reports: PulpTaskGroupProgressReport[];
  tasks: PulpTaskGroupTask[];
};

export type PulpStatusVersion = {
  component: string;
  version: string;
  package: string;
  module: string;
  domain_compatible: boolean;
};

export type PulpStatusApp = {
  name: string;
  last_heartbeat: string;
  versions: Record<string, string>;
};

/**
 * Matches OpenAPI components/schemas/StatusResponse. redis_connection, storage, and
 * content_settings are absent on some deployments, so treat them as nullable.
 */
export type PulpStatus = {
  versions: PulpStatusVersion[];
  online_workers: PulpStatusApp[];
  online_api_apps: PulpStatusApp[];
  online_content_apps: PulpStatusApp[];
  database_connection: { connected: boolean } | null;
  redis_connection: { connected: boolean } | null;
  storage: { total: number; used: number; free: number } | null;
  content_settings: { content_origin: string | null; content_path_prefix: string } | null;
  domain_enabled: boolean;
};

export type PulpOrphanCleanupResult = {
  task: string;
  state: string;
  progress_reports: PulpTaskProgressReport[];
};

/** Same shape as PulpOrphanCleanupResult (task/state/progress_reports from waitForTask); aliased rather than duplicated. */
export type PulpReclaimSpaceResult = PulpOrphanCleanupResult;

export type PulpTaskSchedule = {
  pulp_href: string;
  pulp_created: string;
  name: string;
  task_name: string;
  dispatch_interval: string;
  next_dispatch: string | null;
  last_task: string | null;
};

export type PulpDistribution = {
  pulp_href: string;
  pulp_created: string;
  base_path: string;
  base_url: string;
  name: string;
  repository: string | null;
  content_guard: string | null;
  pulp_labels: Record<string, string>;
};

/** Detail row from GET {distribution_href}. The generic list serializer omits `publication`. */
export type PulpDistributionDetail = PulpDistribution & {
  publication: string | null;
};

/**
 * UI-facing content-guard type discriminator; also the `pulp_type` filter value on
 * GET /contentguards/. See services/pulp/content-guard-kinds.ts for the create-path/label
 * mapping and for deriving a guard's kind from its pulp_href, since the generic list response
 * below carries no pulp_type field.
 */
export type PulpContentGuardKind =
  | "certguard.rhsm"
  | "certguard.x509"
  | "core.composite"
  | "core.content_redirect"
  | "core.header"
  | "core.rbac";

/** Row from GET /contentguards/, the generic cross-type content-guard list. */
export type PulpContentGuard = {
  pulp_href: string;
  prn: string;
  pulp_created: string;
  pulp_last_updated: string;
  name: string;
  description: string | null;
};

/**
 * Detail row from GET {guard_href}, carrying the per-type writable fields the generic list
 * omits. Fields not applicable to the guard's actual kind are absent.
 */
export type PulpContentGuardDetail = PulpContentGuard & {
  /** core/header only. */
  header_name?: string;
  /** core/header only. */
  header_value?: string;
  /** core/header only. */
  jq_filter?: string | null;
  /** certguard/x509 and certguard/rhsm only. */
  ca_certificate?: string;
  /** core/composite only: hrefs of the guards it delegates to. */
  guards?: string[];
  /** core/rbac only, read-only: derived from the guard's role assignments. */
  users?: { username: string; pulp_href: string; prn: string }[];
  /** core/rbac only, read-only: derived from the guard's role assignments. */
  groups?: { name: string; pulp_href: string; prn: string }[];
};

/** Row from GET /publications/, the generic cross-plugin publication list. No PATCH; DELETE is synchronous. */
export type PulpPublication = {
  pulp_href: string;
  pulp_created: string;
  repository_version: string;
  repository: string | null;
};

/** Download policy for a remote, shared by every plugin family. */
export type PulpRemotePolicy = "immediate" | "on_demand" | "streamed";

/**
 * Row from GET .../remotes/{plugin}/{type}/ (e.g. rpm.RpmRemoteResponse).
 * Write-only secrets (password, client_key, proxy credentials) are not returned by Pulp.
 * Plugin-specific fields (see PulpPluginDescriptor.extraRemoteFields) are optional.
 */
export type PulpRemote = {
  pulp_href: string;
  pulp_created: string;
  pulp_last_updated: string | null;
  name: string;
  url: string;
  policy: PulpRemotePolicy;
  tls_validation: boolean;
  pulp_labels: Record<string, string>;
  ca_cert: string | null;
  client_cert: string | null;
  proxy_url: string | null;
  download_concurrency: number | null;
  /** Debian APT only: whitespace-separated list of distributions to sync. */
  distributions?: string | null;
  /** Debian APT only: whitespace-separated list of components; null syncs all available. */
  components?: string | null;
  /** Debian APT only: whitespace-separated list of architectures; null syncs all available. */
  architectures?: string | null;
  /** Debian APT only. */
  sync_sources?: boolean;
  /** Debian APT only. */
  sync_udebs?: boolean;
  /** Debian APT only. */
  sync_installer?: boolean;
  /** Debian APT only: GPG public key the origin releases are verified against. */
  gpgkey?: string | null;
  /** Debian APT only. */
  ignore_missing_package_indices?: boolean;
  /** Python: package names (or name/version specs) to sync. Gem: a name-to-version-requirement map. */
  includes?: string[] | Record<string, string> | null;
  /** Python: package names (or name/version specs) to exclude. Gem: a name-to-version-requirement map. */
  excludes?: string[] | Record<string, string> | null;
  /** Python and Gem only. */
  prereleases?: boolean;
  /** Python only: distribution types to sync, e.g. sdist, bdist_wheel. */
  package_types?: string[] | null;
  /** Python only: number of latest package versions to keep; 0 keeps all. */
  keep_latest_packages?: number | null;
  /** Python only: platforms to exclude from sync. */
  exclude_platforms?: string[] | null;
  /** Python only: whether to also sync PEP 740 provenance files. */
  provenance?: boolean;
};

/** POST .../remotes/{plugin}/{type}/ — matches the Pulp remote create body. */
export type RemoteCreatePayload = {
  name: string;
  url: string;
  policy: PulpRemotePolicy;
  tls_validation: boolean;
  proxy_url: string | null;
  username: string | null;
  password: string | null;
  ca_cert: string | null;
  client_cert: string | null;
  client_key: string | null;
  download_concurrency: number | null;
  /** Debian APT only; required by Pulp on create. */
  distributions?: string | null;
  /** Debian APT only. */
  components?: string | null;
  /** Debian APT only. */
  architectures?: string | null;
  /** Debian APT only. */
  sync_sources?: boolean;
  /** Debian APT only. */
  sync_udebs?: boolean;
  /** Debian APT only. */
  sync_installer?: boolean;
  /** Debian APT only. */
  gpgkey?: string | null;
  /** Debian APT only. */
  ignore_missing_package_indices?: boolean;
  /** Python: package names (or name/version specs) to sync. Gem: a name-to-version-requirement map. */
  includes?: string[] | Record<string, string> | null;
  /** Python: package names (or name/version specs) to exclude. Gem: a name-to-version-requirement map. */
  excludes?: string[] | Record<string, string> | null;
  /** Python and Gem only. */
  prereleases?: boolean;
  /** Python only. */
  package_types?: string[] | null;
  /** Python only. */
  keep_latest_packages?: number | null;
  /** Python only. */
  exclude_platforms?: string[] | null;
  /** Python only. */
  provenance?: boolean;
};

/** PATCH .../remotes/{plugin}/{type}/{id}/ — all fields optional. Omitted secrets are left unchanged. */
export type RemoteUpdatePayload = {
  name?: string;
  url?: string;
  policy?: PulpRemotePolicy;
  tls_validation?: boolean;
  proxy_url?: string | null;
  username?: string | null;
  password?: string | null;
  ca_cert?: string | null;
  client_cert?: string | null;
  client_key?: string | null;
  download_concurrency?: number | null;
  /** Debian APT only; required by Pulp on create. */
  distributions?: string | null;
  /** Debian APT only. */
  components?: string | null;
  /** Debian APT only. */
  architectures?: string | null;
  /** Debian APT only. */
  sync_sources?: boolean;
  /** Debian APT only. */
  sync_udebs?: boolean;
  /** Debian APT only. */
  sync_installer?: boolean;
  /** Debian APT only. */
  gpgkey?: string | null;
  /** Debian APT only. */
  ignore_missing_package_indices?: boolean;
  /** Python: package names (or name/version specs) to sync. Gem: a name-to-version-requirement map. */
  includes?: string[] | Record<string, string> | null;
  /** Python: package names (or name/version specs) to exclude. Gem: a name-to-version-requirement map. */
  excludes?: string[] | Record<string, string> | null;
  /** Python and Gem only. */
  prereleases?: boolean;
  /** Python only. */
  package_types?: string[] | null;
  /** Python only. */
  keep_latest_packages?: number | null;
  /** Python only. */
  exclude_platforms?: string[] | null;
  /** Python only. */
  provenance?: boolean;
};

/**
 * Sync body sent to /api/pulp/repositories/{kind}/sync. The route keeps only the names the
 * plugin declares (see PulpPluginDescriptor.syncFields) and drops the rest.
 */
export type RepositorySyncPayload = {
  pulp_href: string;
  remote: string;
  /** Values for the plugin's declared sync fields, keyed by Pulp field name. */
  fields: Record<string, boolean | string | readonly string[]>;
};

export type RepositorySyncResult = {
  repository: string;
  task: string | null;
};

export type PulpContentItem = {
  pulp_href: string;
  pulp_created: string;
  artifacts: Record<string, string>;
};

export type PulpUploadCreateResult = {
  filename: string;
  size: number;
  sha256: string;
  upload: string | null;
  artifact?: string | null;
  task: string | null;
};

export type PulpUploadAsRpmResult = {
  content: string | null;
  task: string | null;
};

export type PulpAddToRepositoryResult = {
  repository: string | null;
  content: string | null;
  task: string | null;
};

export type PulpRpmRepository = {
  name: string;
  pulp_href: string;
};

export type PulpRepository = {
  name: string;
  pulp_href: string;
  latest_version_href: string | null;
  pulp_labels: Record<string, string>;
};

/** Fields from GET /repositories/rpm/rpm/{id}/ used by the edit UI. */
export type PulpRpmRepositoryDetail = {
  kind: "rpm";
  pulp_href: string;
  name: string;
  pulp_created: string | null;
  versions_href: string | null;
  latest_version_href: string | null;
  description: string | null;
  retain_repo_versions: number | null;
  remote: string | null;
  autopublish: boolean;
  metadata_signing_service: string | null;
  retain_package_versions: number;
  metadata_checksum_type: string | null;
  package_checksum_type: string | null;
  gpgcheck: number;
  repo_gpgcheck: number;
  sqlite_metadata: boolean;
};

export type PulpDebRepositoryDetail = {
  kind: "deb";
  pulp_href: string;
  name: string;
  description: string | null;
  retain_repo_versions: number | null;
  remote: string | null;
  autopublish: boolean;
  structured_repo: boolean;
};

export type PulpFileRepositoryDetail = {
  kind: "file";
  pulp_href: string;
  name: string;
  pulp_created: string | null;
  versions_href: string | null;
  latest_version_href: string | null;
  description: string | null;
  retain_repo_versions: number | null;
  remote: string | null;
  autopublish: boolean;
  manifest: string | null;
};

export type PulpRepositoryDetail =
  | PulpRpmRepositoryDetail
  | PulpDebRepositoryDetail
  | PulpFileRepositoryDetail;

/** Common repository update fields plus every plugin-specific field (see extraRepoFields). */
export type RepositoryUpdatePayload = {
  name: string;
  description: string | null;
  retain_repo_versions: number | null;
  remote: string | null;
  /** rpm, file */
  autopublish?: boolean;
  /** rpm */
  metadata_signing_service?: string | null;
  retain_package_versions?: number;
  metadata_checksum_type?: string | null;
  package_checksum_type?: string | null;
  gpgcheck?: number;
  repo_gpgcheck?: number;
  sqlite_metadata?: boolean;
  /** deb */
  structured_repo?: boolean;
  /** file */
  manifest?: string | null;
};

/** POST /repositories/{plugin}/{type}/ — common create fields plus plugin-specific ones. */
export type RepositoryCreatePayload = {
  pulp_labels: Record<string, string>;
  name: string;
  description: string;
  retain_repo_versions: number | null;
  remote: string | null;
  /** rpm, file */
  autopublish?: boolean;
  /** rpm */
  metadata_signing_service?: string | null;
  retain_package_versions?: number | null;
  /** file */
  manifest?: string | null;
};

/** Per-type counts in repository version content_summary (e.g. rpm.package). */
export type PulpRepositoryVersionContentKind = {
  count: number;
  href: string;
};

export type PulpRepositoryVersionContentSummary = {
  added: Record<string, PulpRepositoryVersionContentKind>;
  removed: Record<string, PulpRepositoryVersionContentKind>;
  present: Record<string, PulpRepositoryVersionContentKind>;
};

/** Row from GET .../repositories/{plugin}/{plugin}/{uuid}/versions/ */
export type PulpRepositoryVersion = {
  pulp_href: string;
  pulp_created: string;
  number: number;
  repository: string;
  base_version: string | null;
  content_summary: PulpRepositoryVersionContentSummary;
};

export type RepositoryVersionsListResult = {
  count: number;
  results: PulpRepositoryVersion[];
};

/** Result of POST .../versions/{n}/repair/ */
export type RepositoryVersionRepairResult = {
  task: string;
  state: string;
};

/** Body of POST {repository_href}modify/ (RepositoryAddRemoveContent). */
export type RepositoryModifyPayload = {
  add_content_units?: string[];
  remove_content_units?: string[];
  base_version?: string;
  overwrite?: boolean;
};

/** Result of POST {repository_href}modify/ - same {task, state} shape as a version repair. */
export type RepositoryModifyResult = RepositoryVersionRepairResult;

export type PulpRpmPackage = {
  pulp_href: string;
  pulp_created: string;
  md5: string | null;
  sha1: string | null;
  sha224: string | null;
  sha256: string | null;
  sha384: string | null;
  sha512: string | null;
  artifact: string | null;
  name: string;
  epoch: string | null;
  version: string;
  release: string;
  arch: string;
  pkgId: string;
  checksum_type: string;
  summary: string | null;
  description: string | null;
  url: string | null;
  changelogs: PulpRpmChangelogEntry[];
  files: PulpRpmFileEntry[];
  requires: PulpRpmDependencyEntry[];
  provides: PulpRpmDependencyEntry[];
  conflicts: PulpRpmDependencyEntry[];
  obsoletes: PulpRpmDependencyEntry[];
  suggests: PulpRpmDependencyEntry[];
  enhances: PulpRpmDependencyEntry[];
  recommends: PulpRpmDependencyEntry[];
  supplements: PulpRpmDependencyEntry[];
  location_base: string;
  location_href: string;
  rpm_buildhost: string | null;
  rpm_group: string | null;
  rpm_license: string | null;
  rpm_packager: string | null;
  rpm_sourcerpm: string | null;
  rpm_vendor: string | null;
  rpm_header_start: number | null;
  rpm_header_end: number | null;
  is_modular: boolean;
  size_archive: number | null;
  size_installed: number | null;
  size_package: number | null;
  time_build: number | null;
  time_file: number | null;
  [key: string]: unknown;
};

export type PulpRpmChangelogEntry = [author: string, timestamp: number, text: string];
export type PulpRpmFileEntry = [
  type: string,
  directory: string,
  filename: string,
  checksum: string
];
export type PulpRpmDependencyEntry = [
  name: string,
  relation: string | null,
  epoch: string | null,
  version: string | null,
  release: string | null,
  pre: boolean
];

export type PulpPaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type UpdatePulpDistributionPayload = {
  name?: string;
  base_path?: string;
  repository?: string | null;
  publication?: string | null;
  content_guard?: string | null;
};

/**
 * POST /api/pulp/contentguards — dispatches on `kind` to the matching upstream create path.
 * Fields not applicable to `kind` are ignored by the route.
 */
export type CreatePulpContentGuardPayload = {
  kind: PulpContentGuardKind;
  name: string;
  description?: string | null;
  header_name?: string;
  header_value?: string;
  jq_filter?: string | null;
  ca_certificate?: string;
  guards?: string[];
};

export type UpdatePulpContentGuardPayload = {
  name?: string;
  description?: string | null;
  header_name?: string;
  header_value?: string;
  jq_filter?: string | null;
  ca_certificate?: string;
  guards?: string[];
};

export type CreatePulpUserPayload = {
  username: string;
  password: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  is_staff?: boolean;
  is_active?: boolean;
};

export type UpdatePulpUserPayload = {
  username?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  is_staff?: boolean;
  is_active?: boolean;
};

export type ChangePulpUserPasswordPayload = {
  password: string;
};

export type CreatePulpGroupPayload = {
  name: string;
};

export type UpdatePulpGroupPayload = {
  name: string;
};

/** Result of GET /api/pulp/resolve — a pulp_href or PRN resolved to the object it names. */
export type PulpResolvedResource = {
  pulp_href: string;
  prn: string;
  name: string | null;
};

/** One hit within a PulpSearchGroup from GET /api/pulp/search. */
export type PulpSearchHit = {
  pulp_href: string;
  prn: string;
  name: string;
};

/**
 * One resource family's results from GET /api/pulp/search. `count` is the upstream total, which
 * may exceed `results.length` when there are more matches than the query limit. `error` is the
 * upstream detail string when this family's request failed; the other families still render.
 */
export type PulpSearchGroup = {
  family: PulpResourceFamily;
  count: number;
  results: PulpSearchHit[];
  error: string | null;
};
