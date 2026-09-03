/**
 * Registry of Pulp content plugins ("families").
 *
 * Per-plugin repository and remote endpoints follow the same shape, so routes,
 * services and pages read their paths and capabilities from here instead of
 * branching on a hardcoded ("rpm" | "deb" | "file") union. Adding a plugin is a
 * new entry in PULP_PLUGINS, not a new set of near-identical files.
 *
 * Paths and capabilities verified against the OpenAPI spec of a Pulp server
 * running core 3.116.1 with rpm 3.38.5, deb 3.10.0 and file.
 */

/** Sync request body accepted by a repository's sync/ endpoint. */
export type PulpSyncFlavor = "sync_policy" | "mirror";

/**
 * A writable remote field a plugin adds beyond the common set.
 *
 * Routes coerce the value by `type` and pages render it from `label` and
 * `placeholder`, so a plugin's extra fields need no per-kind branches.
 */
export type PulpRemoteField = {
  /** Pulp field name, sent verbatim in the request body. */
  name: string;
  type: "string" | "boolean";
  /** Rejected before the request when blank. Pulp requires it on create. */
  required?: boolean;
  label: string;
  placeholder?: string;
};

export type PulpPluginKind = "rpm" | "deb" | "file";

export type PulpPluginDescriptor = {
  kind: PulpPluginKind;
  /** Display name used in page headings, tabs and messages. */
  label: string;
  /** Indefinite article for `label`, so error copy reads "an RPM" / "a Debian". */
  article: "a" | "an";
  repositoryPath: string;
  remotePath: string;
  /** null when the plugin has no publications endpoint. */
  publicationPath: string | null;
  /** The `pulp_type` of this plugin's primary content unit, for filtering GET /content/. */
  contentType: string;
  supportsPublish: boolean;
  supportsSync: boolean;
  /**
   * Extra body fields sent when creating a publication (POST publicationPath),
   * alongside the repository href. Debian requires a publication style flag.
   */
  publicationDefaults?: Record<string, unknown>;
  /**
   * "sync_policy": { remote, sync_policy, optimize } (rpm).
   * "mirror": { remote, mirror, optimize } (generic RepositorySyncURL).
   */
  syncFlavor: PulpSyncFlavor;
  /** Writable remote fields beyond the common set. */
  extraRemoteFields: readonly PulpRemoteField[];
  /** Writable repository fields beyond the common set, in Pulp field-name form. */
  extraRepoFields: readonly string[];
};

export const PULP_PLUGINS: readonly PulpPluginDescriptor[] = [
  {
    kind: "rpm",
    label: "RPM",
    article: "an",
    repositoryPath: "/repositories/rpm/rpm/",
    remotePath: "/remotes/rpm/rpm/",
    publicationPath: "/publications/rpm/rpm/",
    contentType: "rpm.package",
    supportsPublish: true,
    supportsSync: true,
    syncFlavor: "sync_policy",
    extraRemoteFields: [],
    extraRepoFields: [
      "autopublish",
      "metadata_signing_service",
      "retain_package_versions",
      "metadata_checksum_type",
      "package_checksum_type",
      "gpgcheck",
      "repo_gpgcheck",
      "sqlite_metadata",
    ],
  },
  {
    kind: "deb",
    label: "Debian",
    article: "a",
    repositoryPath: "/repositories/deb/apt/",
    remotePath: "/remotes/deb/apt/",
    publicationPath: "/publications/deb/apt/",
    contentType: "deb.package",
    supportsPublish: true,
    supportsSync: true,
    publicationDefaults: { simple: true },
    syncFlavor: "mirror",
    extraRemoteFields: [
      {
        name: "distributions",
        type: "string",
        required: true,
        label: "Distributions",
        placeholder: "bookworm bookworm-updates",
      },
      { name: "components", type: "string", label: "Components", placeholder: "main contrib" },
      {
        name: "architectures",
        type: "string",
        label: "Architectures",
        placeholder: "amd64 arm64",
      },
      {
        name: "gpgkey",
        type: "string",
        label: "GPG public key",
        placeholder: "-----BEGIN PGP PUBLIC KEY BLOCK-----",
      },
      { name: "sync_sources", type: "boolean", label: "Sync source packages" },
      { name: "sync_udebs", type: "boolean", label: "Sync installer (udeb) packages" },
      { name: "sync_installer", type: "boolean", label: "Sync installer files" },
      {
        name: "ignore_missing_package_indices",
        type: "boolean",
        label: "Ignore missing package indices",
      },
    ],
    extraRepoFields: ["structured_repo"],
  },
  {
    kind: "file",
    label: "File",
    article: "a",
    repositoryPath: "/repositories/file/file/",
    remotePath: "/remotes/file/file/",
    publicationPath: "/publications/file/file/",
    contentType: "file.file",
    supportsPublish: true,
    supportsSync: true,
    syncFlavor: "mirror",
    extraRemoteFields: [],
    extraRepoFields: ["autopublish", "manifest"],
  },
] as const;

export function isPulpPluginKind(value: unknown): value is PulpPluginKind {
  return typeof value === "string" && PULP_PLUGINS.some((p) => p.kind === value);
}

/** Descriptor for a kind, or null when the kind is unknown. */
export function findPulpPlugin(kind: string): PulpPluginDescriptor | null {
  return PULP_PLUGINS.find((p) => p.kind === kind) ?? null;
}

/** Descriptor for a kind. Throws when the kind is unknown; use in client code where the kind is typed. */
export function getPulpPlugin(kind: PulpPluginKind): PulpPluginDescriptor {
  const plugin = findPulpPlugin(kind);
  if (!plugin) {
    throw new Error(`Unknown Pulp plugin kind: ${kind}`);
  }
  return plugin;
}
