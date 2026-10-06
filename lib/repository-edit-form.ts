import type {
  PulpDebRepositoryDetail,
  PulpFileRepositoryDetail,
  PulpRpmRepositoryDetail,
  RepositoryUpdatePayload,
} from "@/services/pulp/types";

/** retain_checkpoints is a whole number of at least 1 (the spec's `minimum`), or null to keep every checkpoint. */
export const RETAIN_CHECKPOINTS_MINIMUM = 1;

export const RETAIN_CHECKPOINTS_PROBLEM = `Retain checkpoints must be a whole number of at least ${RETAIN_CHECKPOINTS_MINIMUM}.`;

/** A message when `value` is neither blank (null/undefined) nor a whole number at or above the minimum, or null. */
export function retainCheckpointsProblem(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= RETAIN_CHECKPOINTS_MINIMUM
    ? null
    : RETAIN_CHECKPOINTS_PROBLEM;
}

/** retain_repo_versions is a whole number of at least 1 (the spec's `minimum`), or null to keep every version. */
export const RETAIN_REPO_VERSIONS_MINIMUM = 1;

export const RETAIN_REPO_VERSIONS_PROBLEM = `Retain repo versions must be a whole number of at least ${RETAIN_REPO_VERSIONS_MINIMUM}.`;

/** A message when `value` is neither blank (null/undefined/"") nor a whole number at or above the minimum, or null. */
export function retainRepoVersionsProblem(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= RETAIN_REPO_VERSIONS_MINIMUM
    ? null
    : RETAIN_REPO_VERSIONS_PROBLEM;
}

export const checksumAlgorithms = ["sha256", "sha1", "md5", "sha224", "sha384", "sha512"] as const;

export function rpmDetailToForm(d: PulpRpmRepositoryDetail): RepositoryUpdatePayload {
  return {
    name: d.name,
    description: d.description,
    retain_repo_versions: d.retain_repo_versions,
    retain_checkpoints: d.retain_checkpoints,
    remote: d.remote,
    autopublish: d.autopublish,
    metadata_signing_service: d.metadata_signing_service,
    retain_package_versions: d.retain_package_versions,
    metadata_checksum_type: d.metadata_checksum_type,
    package_checksum_type: d.package_checksum_type,
    gpgcheck: d.gpgcheck,
    repo_gpgcheck: d.repo_gpgcheck,
    sqlite_metadata: d.sqlite_metadata,
  };
}

export function debDetailToForm(d: PulpDebRepositoryDetail): RepositoryUpdatePayload {
  return {
    name: d.name,
    description: d.description,
    retain_repo_versions: d.retain_repo_versions,
    retain_checkpoints: d.retain_checkpoints,
    remote: d.remote,
    autopublish: d.autopublish,
    structured_repo: d.structured_repo,
  };
}

export function fileDetailToForm(d: PulpFileRepositoryDetail): RepositoryUpdatePayload {
  return {
    name: d.name,
    description: d.description,
    retain_repo_versions: d.retain_repo_versions,
    retain_checkpoints: d.retain_checkpoints,
    remote: d.remote,
    autopublish: d.autopublish,
    manifest: d.manifest,
  };
}

export type RpmReadOnlyMeta = {
  pulp_href: string;
  pulp_created: string | null;
  versions_href: string | null;
  latest_version_href: string | null;
};
