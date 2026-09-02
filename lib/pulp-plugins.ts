/**
 * Registry of Pulp content plugins ("families").
 *
 * Per-plugin repository endpoints follow the same shape, so routes, services and
 * pages read their paths and capabilities from here instead of branching on a
 * hardcoded ("rpm" | "deb" | "file") union. Adding a plugin is a new entry in
 * PULP_PLUGINS, not a new set of near-identical files.
 *
 * Paths and capabilities verified against the OpenAPI spec of a Pulp server
 * running core 3.116.1 with rpm 3.38.5, deb 3.10.0 and file.
 */

export type PulpPluginKind = "rpm" | "deb" | "file";

export type PulpPluginDescriptor = {
  kind: PulpPluginKind;
  /** Display name used in page headings, tabs and messages. */
  label: string;
  /** Indefinite article for `label`, so error copy reads "an RPM" / "a Debian". */
  article: "a" | "an";
  repositoryPath: string;
  /** null when the plugin has no publications endpoint. */
  publicationPath: string | null;
  supportsPublish: boolean;
  /**
   * Extra body fields sent when creating a publication (POST publicationPath),
   * alongside the repository href. Debian requires a publication style flag.
   */
  publicationDefaults?: Record<string, unknown>;
  /** Writable repository fields beyond the common set, in Pulp field-name form. */
  extraRepoFields: readonly string[];
};

export const PULP_PLUGINS: readonly PulpPluginDescriptor[] = [
  {
    kind: "rpm",
    label: "RPM",
    article: "an",
    repositoryPath: "/repositories/rpm/rpm/",
    publicationPath: "/publications/rpm/rpm/",
    supportsPublish: true,
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
    publicationPath: "/publications/deb/apt/",
    supportsPublish: true,
    publicationDefaults: { simple: true },
    extraRepoFields: ["structured_repo"],
  },
  {
    kind: "file",
    label: "File",
    article: "a",
    repositoryPath: "/repositories/file/file/",
    publicationPath: "/publications/file/file/",
    supportsPublish: true,
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
