import type {
  PulpDebRepositoryDetail,
  PulpFileRepositoryDetail,
  PulpRpmRepositoryDetail,
  RepositoryUpdatePayload,
} from "@/services/pulp/types";

export const checksumAlgorithms = ["sha256", "sha1", "md5", "sha224", "sha384", "sha512"] as const;

export function rpmDetailToForm(d: PulpRpmRepositoryDetail): RepositoryUpdatePayload {
  return {
    name: d.name,
    description: d.description,
    retain_repo_versions: d.retain_repo_versions,
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
