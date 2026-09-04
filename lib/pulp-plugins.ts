/**
 * Registry of Pulp content plugins ("families").
 *
 * Per-plugin repository and remote endpoints follow the same shape, so routes,
 * services and pages read their paths and capabilities from here instead of
 * branching on a hardcoded ("rpm" | "deb" | "file") union. Adding a plugin is a
 * new entry in PULP_PLUGINS, not a new set of near-identical files.
 *
 * Paths and capabilities verified against the OpenAPI spec of a Pulp server
 * running core 3.116.1 with rpm 3.38.5, deb 3.10.0, file, python 3.35.0, npm 0.10.1,
 * gem 0.8.0 and maven 0.25.1.
 */

/** Sync request body accepted by a repository's sync/ endpoint. */
export type PulpSyncFlavor = "sync_policy" | "mirror" | "mirror_only";

/**
 * A writable remote field a plugin adds beyond the common set.
 *
 * Routes coerce the value by `type` and pages render it from `label` and
 * `placeholder`, so a plugin's extra fields need no per-kind branches.
 */
export type PulpRemoteField = {
  /** Pulp field name, sent verbatim in the request body. */
  name: string;
  /**
   * "string_list": string[], entered one value per line (or a multi-select when `options`
   * is set). "integer": number | null. "json": a JSON object typed as text, used only by
   * gem's `includes`/`excludes`.
   */
  type: "string" | "boolean" | "string_list" | "integer" | "json";
  /** Rejected before the request when blank. Pulp requires it on create. */
  required?: boolean;
  label: string;
  placeholder?: string;
  /** "string_list" only: render a multi-select of these values instead of a textarea. */
  options?: readonly string[];
};

/**
 * Widened to `string` so plugin kinds can come from a runtime-fetched descriptor list
 * (see components/pulp/plugins-context.ts) rather than only this module's compiled-in
 * PULP_PLUGINS. Kept as a named alias so existing type-only imports don't change.
 */
export type PulpPluginKind = string;

/** A content-listing column: a Pulp field name paired with its display label. */
export type PulpContentField = {
  name: string;
  label: string;
};

export type PulpPluginDescriptor = {
  kind: PulpPluginKind;
  /** Display name used in page headings, tabs and messages. */
  label: string;
  /** Indefinite article for `label`, so error copy reads "an RPM" / "a Debian". */
  article: "a" | "an";
  repositoryPath: string;
  remotePath: string;
  /** Placeholder shown in the remote URL field of the create/edit form. */
  remoteUrlPlaceholder: string;
  /** null when the plugin has no publications endpoint. */
  publicationPath: string | null;
  /** Distribution list/create endpoint for this plugin. */
  distributionPath: string;
  /** The `pulp_type` of this plugin's primary content unit, for filtering GET /content/. */
  contentType: string;
  /** Per-plugin content-listing endpoint for this plugin's primary content unit. */
  contentPath: string;
  /** Columns shown when browsing a repository's content, in display order. */
  contentFields: readonly PulpContentField[];
  /** Byte-size field on the content unit, when it has one (used for the content list's size total). */
  contentSizeField?: string;
  /**
   * Set when the plugin's content endpoint cannot serve a `fields=` query. gem 0.8.0 answers
   * 500 to any `fields=` value on /content/gem/gem/, so its rows are fetched in full.
   */
  contentFieldsQueryUnsupported?: true;
  supportsPublish: boolean;
  supportsSync: boolean;
  /**
   * Extra body fields sent when creating a publication (POST publicationPath),
   * alongside the repository href. Debian requires a publication style flag.
   */
  publicationDefaults?: Record<string, unknown>;
  /**
   * "sync_policy": { remote, sync_policy, optimize } (rpm).
   * "mirror": { remote, mirror, optimize } (deb's AptRepositorySyncURL, file's FileRepositorySyncURL).
   * "mirror_only": { remote, mirror } -- the core RepositorySyncURL, which rejects `optimize`
   * with "Unexpected field" (python, npm, gem; maven has no sync endpoint at all).
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
    remoteUrlPlaceholder: "https://dl.fedoraproject.org/pub/epel/9/Everything/x86_64/",
    publicationPath: "/publications/rpm/rpm/",
    distributionPath: "/distributions/rpm/rpm/",
    contentType: "rpm.package",
    contentPath: "/content/rpm/packages/",
    contentFields: [
      { name: "name", label: "Name" },
      { name: "epoch", label: "Epoch" },
      { name: "version", label: "Version" },
      { name: "release", label: "Release" },
      { name: "arch", label: "Arch" },
    ],
    contentSizeField: "size_package",
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
    remoteUrlPlaceholder: "http://deb.debian.org/debian",
    publicationPath: "/publications/deb/apt/",
    distributionPath: "/distributions/deb/apt/",
    contentType: "deb.package",
    contentPath: "/content/deb/packages/",
    contentFields: [
      { name: "package", label: "Package" },
      { name: "version", label: "Version" },
      { name: "architecture", label: "Architecture" },
      { name: "relative_path", label: "Relative path" },
    ],
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
    remoteUrlPlaceholder: "https://example.com/path/to/PULP_MANIFEST",
    publicationPath: "/publications/file/file/",
    distributionPath: "/distributions/file/file/",
    contentType: "file.file",
    contentPath: "/content/file/files/",
    contentFields: [
      { name: "relative_path", label: "Relative path" },
      { name: "sha256", label: "SHA256" },
    ],
    supportsPublish: true,
    supportsSync: true,
    syncFlavor: "mirror",
    extraRemoteFields: [],
    extraRepoFields: ["autopublish", "manifest"],
  },
  {
    kind: "python",
    label: "Python",
    article: "a",
    repositoryPath: "/repositories/python/python/",
    remotePath: "/remotes/python/python/",
    remoteUrlPlaceholder: "https://pypi.org/",
    publicationPath: "/publications/python/pypi/",
    distributionPath: "/distributions/python/pypi/",
    contentType: "python.python",
    contentPath: "/content/python/packages/",
    contentFields: [
      { name: "name", label: "Name" },
      { name: "version", label: "Version" },
      { name: "filename", label: "Filename" },
      { name: "packagetype", label: "Package type" },
    ],
    contentSizeField: "size",
    supportsPublish: true,
    supportsSync: true,
    syncFlavor: "mirror_only",
    extraRemoteFields: [
      {
        name: "includes",
        type: "string_list",
        label: "Includes",
        placeholder: "django\nrequests",
      },
      {
        name: "excludes",
        type: "string_list",
        label: "Excludes",
        placeholder: "django-allauth",
      },
      { name: "prereleases", type: "boolean", label: "Sync pre-releases" },
      {
        name: "package_types",
        type: "string_list",
        label: "Package types",
        options: [
          "bdist_dmg",
          "bdist_dumb",
          "bdist_egg",
          "bdist_msi",
          "bdist_rpm",
          "bdist_wheel",
          "bdist_wininst",
          "sdist",
        ],
      },
      {
        name: "keep_latest_packages",
        type: "integer",
        label: "Keep latest packages",
        placeholder: "0 keeps all versions",
      },
      {
        name: "exclude_platforms",
        type: "string_list",
        label: "Exclude platforms",
        options: ["windows", "macos", "freebsd", "linux"],
      },
      { name: "provenance", type: "boolean", label: "Sync provenance files" },
    ],
    extraRepoFields: [],
  },
  {
    kind: "npm",
    label: "npm",
    article: "an",
    repositoryPath: "/repositories/npm/npm/",
    remotePath: "/remotes/npm/npm/",
    remoteUrlPlaceholder: "https://registry.npmjs.org/",
    publicationPath: null,
    distributionPath: "/distributions/npm/npm/",
    contentType: "npm.package",
    contentPath: "/content/npm/packages/",
    contentFields: [
      { name: "name", label: "Name" },
      { name: "version", label: "Version" },
      { name: "relative_path", label: "Relative path" },
    ],
    supportsPublish: false,
    supportsSync: true,
    syncFlavor: "mirror_only",
    extraRemoteFields: [],
    extraRepoFields: [],
  },
  {
    kind: "gem",
    label: "Gem",
    article: "a",
    repositoryPath: "/repositories/gem/gem/",
    remotePath: "/remotes/gem/gem/",
    remoteUrlPlaceholder: "https://rubygems.org/",
    publicationPath: "/publications/gem/gem/",
    distributionPath: "/distributions/gem/gem/",
    contentType: "gem.gem",
    contentPath: "/content/gem/gem/",
    contentFieldsQueryUnsupported: true,
    contentFields: [
      { name: "name", label: "Name" },
      { name: "version", label: "Version" },
      { name: "platform", label: "Platform" },
      { name: "prerelease", label: "Prerelease" },
    ],
    supportsPublish: true,
    supportsSync: true,
    syncFlavor: "mirror_only",
    extraRemoteFields: [
      { name: "prereleases", type: "boolean", label: "Sync pre-releases" },
      {
        name: "includes",
        type: "json",
        label: "Includes",
        placeholder: '{"rails": "~>7.0"}',
      },
      {
        name: "excludes",
        type: "json",
        label: "Excludes",
        placeholder: '{"rails": "~>6.0"}',
      },
    ],
    extraRepoFields: [],
  },
  {
    kind: "maven",
    label: "Maven",
    article: "a",
    repositoryPath: "/repositories/maven/maven/",
    remotePath: "/remotes/maven/maven/",
    remoteUrlPlaceholder: "https://repo1.maven.org/maven2/",
    publicationPath: null,
    distributionPath: "/distributions/maven/maven/",
    contentType: "maven.artifact",
    contentPath: "/content/maven/artifact/",
    contentFields: [
      { name: "group_id", label: "Group ID" },
      { name: "artifact_id", label: "Artifact ID" },
      { name: "version", label: "Version" },
      { name: "filename", label: "Filename" },
    ],
    supportsPublish: false,
    supportsSync: false,
    syncFlavor: "mirror_only",
    extraRemoteFields: [],
    extraRepoFields: [],
  },
] as const;

/**
 * Matching logic below takes the descriptor list as its first argument so it can run against
 * either the compiled-in PULP_PLUGINS (the module-level exports here) or a runtime-fetched list
 * (components/pulp/plugins-context.ts). Keep this the single copy of each match; do not
 * duplicate it against a second list.
 */

export function isPulpPluginKindIn(
  plugins: readonly PulpPluginDescriptor[],
  value: unknown
): value is PulpPluginKind {
  return typeof value === "string" && plugins.some((p) => p.kind === value);
}

/** Descriptor for a kind, or null when the kind is unknown. */
export function findPulpPluginIn(
  plugins: readonly PulpPluginDescriptor[],
  kind: string
): PulpPluginDescriptor | null {
  return plugins.find((p) => p.kind === kind) ?? null;
}

/**
 * Descriptor for the plugin whose repositoryPath appears in a repository href (relative API
 * path or absolute URL), or null when the href matches no plugin.
 */
export function findPluginForRepositoryHrefIn(
  plugins: readonly PulpPluginDescriptor[],
  href: string
): PulpPluginDescriptor | null {
  return plugins.find((p) => href.includes(p.repositoryPath)) ?? null;
}

/**
 * Kind and id extracted from a content unit href (relative API path or absolute URL) whose path
 * matches a plugin's contentPath, or null when no plugin's contentPath matches.
 */
export function findContentForHrefIn(
  plugins: readonly PulpPluginDescriptor[],
  href: string
): { kind: PulpPluginKind; id: string } | null {
  for (const plugin of plugins) {
    const index = href.indexOf(plugin.contentPath);
    if (index === -1) continue;
    const id = href.slice(index + plugin.contentPath.length).replace(/\/+$/, "").split("/")[0];
    if (id) {
      return { kind: plugin.kind, id };
    }
  }
  return null;
}

/** Descriptor for a kind. Throws when the kind is unknown; use in client code where the kind is typed. */
export function getPulpPluginIn(
  plugins: readonly PulpPluginDescriptor[],
  kind: PulpPluginKind
): PulpPluginDescriptor {
  const plugin = findPulpPluginIn(plugins, kind);
  if (!plugin) {
    throw new Error(`Unknown Pulp plugin kind: ${kind}`);
  }
  return plugin;
}

export function isPulpPluginKind(value: unknown): value is PulpPluginKind {
  return isPulpPluginKindIn(PULP_PLUGINS, value);
}

/** Descriptor for a kind, or null when the kind is unknown. */
export function findPulpPlugin(kind: string): PulpPluginDescriptor | null {
  return findPulpPluginIn(PULP_PLUGINS, kind);
}

/**
 * Descriptor for the plugin whose repositoryPath appears in a repository href (relative API
 * path or absolute URL), or null when the href matches no plugin.
 */
export function findPluginForRepositoryHref(href: string): PulpPluginDescriptor | null {
  return findPluginForRepositoryHrefIn(PULP_PLUGINS, href);
}

/**
 * Kind and id extracted from a content unit href (relative API path or absolute URL) whose path
 * matches a plugin's contentPath, or null when no plugin's contentPath matches.
 */
export function findContentForHref(href: string): { kind: PulpPluginKind; id: string } | null {
  return findContentForHrefIn(PULP_PLUGINS, href);
}

/** Descriptor for a kind. Throws when the kind is unknown; use in client code where the kind is typed. */
export function getPulpPlugin(kind: PulpPluginKind): PulpPluginDescriptor {
  return getPulpPluginIn(PULP_PLUGINS, kind);
}
