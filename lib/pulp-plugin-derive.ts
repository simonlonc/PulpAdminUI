/**
 * Derives PulpPluginDescriptor values straight from a Pulp OpenAPI document, so the UI can
 * offer basic support for a plugin nobody hand-wrote an entry for in PULP_PLUGINS.
 *
 * The spec comes over the network from a server this code does not control, so every step
 * here validates its input and skips (rather than throws) on anything that does not match the
 * expected shape. derivePulpPlugins() returns whatever families it could derive, possibly none.
 */

import type { PulpContentField, PulpPluginDescriptor, PulpRemoteField, PulpSyncField } from "@/lib/pulp-plugins";

const API_PREFIX = "/pulp/api/v3";

type SchemaRecord = Record<string, unknown>;

function asRecord(value: unknown): SchemaRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as SchemaRecord;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/** Resolves a `#/components/schemas/Name` ref to its schema name, or null when not a ref string. */
function schemaRefName(ref: unknown): string | null {
  if (typeof ref !== "string") return null;
  const prefix = "#/components/schemas/";
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : null;
}

function schemaProperties(schema: SchemaRecord | null): SchemaRecord {
  return asRecord(schema?.properties) ?? {};
}

function schemaRequired(schema: SchemaRecord | null): Set<string> {
  return new Set(asStringArray(schema?.required));
}

function propType(prop: unknown): string | null {
  const record = asRecord(prop);
  return record && typeof record.type === "string" ? record.type : null;
}

/** items.enum, when the property is an array with an inline enum (not a $ref). */
function propItemsEnum(prop: unknown): readonly string[] | undefined {
  const items = asRecord(asRecord(prop)?.items);
  const values = asStringArray(items?.enum);
  return values.length > 0 ? values : undefined;
}

/** "upstream_name" -> "Upstream Name", "hugging_face" -> "Hugging Face". */
function humanise(name: string): string {
  return name
    .split(/[_-]/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

type PathEntry = { app: string; type: string; path: string };

/** List paths matching `${API_PREFIX}/{resource}/{app}/{type}/` -- exactly two segments, no `{`. */
function listResourcePaths(paths: SchemaRecord, resource: string): PathEntry[] {
  const pattern = new RegExp(`^${API_PREFIX}/${resource}/([^/{}]+)/([^/{}]+)/$`);
  const entries: PathEntry[] = [];
  for (const key of Object.keys(paths)) {
    const match = pattern.exec(key);
    if (match) {
      entries.push({ app: match[1], type: match[2], path: key });
    }
  }
  return entries;
}

function groupByApp(entries: PathEntry[]): Map<string, { type: string; path: string }[]> {
  const map = new Map<string, { type: string; path: string }[]>();
  for (const entry of entries) {
    const list = map.get(entry.app) ?? [];
    list.push({ type: entry.type, path: entry.path });
    map.set(entry.app, list);
  }
  return map;
}

function hasPostOperation(paths: SchemaRecord, path: string): boolean {
  return asRecord(asRecord(paths[path])?.post) !== null;
}

/**
 * Picks one candidate for a repository's remote/publication/distribution path:
 * the one whose type segment matches the repository's type, else the one whose type segment
 * matches the app, else the first when sorted by type segment.
 */
function pickPath(
  candidates: { type: string; path: string }[],
  repoType: string,
  app: string
): string | null {
  if (candidates.length === 0) return null;
  const byRepoType = candidates.find((c) => c.type === repoType);
  if (byRepoType) return byRepoType.path;
  const byApp = candidates.find((c) => c.type === app);
  if (byApp) return byApp.path;
  const sorted = [...candidates].sort((a, b) => a.type.localeCompare(b.type));
  return sorted[0].path;
}

function chooseContentCandidate(
  candidates: { type: string; path: string }[]
): { type: string; path: string } | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => a.type.localeCompare(b.type))[0];
}

/** The POST request body schema for a path, resolved through its $ref. */
function postRequestSchema(paths: SchemaRecord, schemas: SchemaRecord, path: string): SchemaRecord | null {
  const post = asRecord(asRecord(paths[path])?.post);
  const content = asRecord(asRecord(post?.requestBody)?.content);
  const json = asRecord(content?.["application/json"]);
  const schemaRef = asRecord(json?.schema);
  const refName = schemaRefName(schemaRef?.$ref);
  return refName ? asRecord(schemas[refName]) : null;
}

/** The GET list response's item schema for a path, resolved through the paginated wrapper's $ref. */
function getResponseItemSchema(paths: SchemaRecord, schemas: SchemaRecord, path: string): SchemaRecord | null {
  const get = asRecord(asRecord(paths[path])?.get);
  const responses = asRecord(get?.responses);
  const ok = asRecord(responses?.["200"]);
  const content = asRecord(ok?.content);
  const json = asRecord(content?.["application/json"]);
  const pageSchemaRef = asRecord(json?.schema);
  const pageRefName = schemaRefName(pageSchemaRef?.$ref);
  const pageSchema = pageRefName ? asRecord(schemas[pageRefName]) : null;
  const results = asRecord(schemaProperties(pageSchema).results);
  const items = asRecord(results?.items);
  const itemRefName = schemaRefName(items?.$ref);
  return itemRefName ? asRecord(schemas[itemRefName]) : null;
}

/** The `pulp_type` enum of the `pulp_type` query parameter on `/pulp/api/v3/content/`. */
function pulpTypeEnum(paths: SchemaRecord): string[] {
  const get = asRecord(asRecord(paths[`${API_PREFIX}/content/`])?.get);
  const parameters = get?.parameters;
  if (!Array.isArray(parameters)) return [];
  for (const param of parameters) {
    const record = asRecord(param);
    if (record?.name !== "pulp_type") continue;
    return asStringArray(asRecord(record.schema)?.enum);
  }
  return [];
}

/** The intersection of property names across a set of schemas. */
function commonPropertyNames(schemas: SchemaRecord[]): Set<string> {
  let common: Set<string> | null = null;
  for (const schema of schemas) {
    const names = new Set(Object.keys(schemaProperties(schema)));
    if (common === null) {
      common = names;
      continue;
    }
    const intersection = new Set<string>();
    for (const name of common) {
      if (names.has(name)) intersection.add(name);
    }
    common = intersection;
  }
  return common ?? new Set();
}

function mapRemoteFieldType(type: string | null): PulpRemoteField["type"] {
  switch (type) {
    case "boolean":
      return "boolean";
    case "integer":
    case "number":
      return "integer";
    case "array":
      return "string_list";
    case "object":
      return "json";
    default:
      return "string";
  }
}

function buildExtraRemoteFields(
  paths: SchemaRecord,
  schemas: SchemaRecord,
  remotePath: string,
  excluded: Set<string>
): PulpRemoteField[] {
  const schema = postRequestSchema(paths, schemas, remotePath);
  const required = schemaRequired(schema);
  const fields: PulpRemoteField[] = [];
  for (const [name, prop] of Object.entries(schemaProperties(schema))) {
    if (excluded.has(name)) continue;
    const type = mapRemoteFieldType(propType(prop));
    const field: PulpRemoteField = { name, type, label: humanise(name) };
    if (required.has(name)) field.required = true;
    if (type === "string_list") {
      const options = propItemsEnum(prop);
      if (options) field.options = options;
    }
    fields.push(field);
  }
  fields.sort((a, b) => a.name.localeCompare(b.name));
  return fields;
}

/** Enum values of a string enum schema, resolving a `$ref` and a wrapping `allOf`. */
function resolveStringEnum(schemas: SchemaRecord, prop: unknown): readonly string[] | undefined {
  const record = asRecord(prop);
  if (!record) return undefined;
  const refName = schemaRefName(record.$ref);
  if (refName) return resolveStringEnum(schemas, schemas[refName]);
  if (Array.isArray(record.allOf)) {
    for (const entry of record.allOf) {
      const values = resolveStringEnum(schemas, entry);
      if (values) return values;
    }
    return undefined;
  }
  const values = asStringArray(record.enum);
  if (values.length === 0) return undefined;
  return record.type === undefined || record.type === "string" ? values : undefined;
}

/**
 * The sync request body's writable properties, in schema declaration order. `remote` is skipped
 * because the sync modal has its own remote picker, and `mirror` is skipped when the same schema
 * declares `sync_policy` -- the spec marks it deprecated and Pulp treats the two as alternatives.
 * A property that maps to no control is skipped for the same reason `policy` is excluded from the
 * derived remote fields: a free-text box posting a value the server rejects is worse than nothing.
 */
function buildSyncFields(
  paths: SchemaRecord,
  schemas: SchemaRecord,
  syncPath: string
): PulpSyncField[] {
  const properties = schemaProperties(postRequestSchema(paths, schemas, syncPath));
  const hasSyncPolicy = "sync_policy" in properties;
  const fields: PulpSyncField[] = [];
  for (const [name, prop] of Object.entries(properties)) {
    if (name === "remote") continue;
    if (name === "mirror" && hasSyncPolicy) continue;
    const record = asRecord(prop);
    const label = humanise(name);
    const type = propType(prop);
    if (type === "boolean") {
      const value = typeof record?.default === "boolean" ? record.default : false;
      fields.push({ name, type: "boolean", label, default: value });
      continue;
    }
    const options = resolveStringEnum(schemas, prop);
    if (options) {
      const field: PulpSyncField = { name, type: "enum", label, options };
      if (typeof record?.default === "string") field.default = record.default;
      fields.push(field);
      continue;
    }
    if (type === "array") {
      const itemOptions = resolveStringEnum(schemas, record?.items);
      if (itemOptions) {
        fields.push({ name, type: "string_list", label, options: itemOptions });
      }
    }
  }
  return fields;
}

function buildExtraRepoFields(
  paths: SchemaRecord,
  schemas: SchemaRecord,
  repositoryPath: string,
  excluded: Set<string>
): string[] {
  const schema = postRequestSchema(paths, schemas, repositoryPath);
  return Object.keys(schemaProperties(schema))
    .filter((name) => !excluded.has(name))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * pulp_type is not in the spec's content schemas, and a camel-to-snake rule on the response
 * schema name gets it wrong about half the time (file.FileContent -> file.file works,
 * rpm.UpdateRecord -> rpm.advisory does not follow any derivable rule). So this only derives a
 * contentType when it is unambiguous: exactly one content list path for the app, and exactly
 * one enum entry starting with `${app}.`. Otherwise it is left as "" -- callers must handle
 * an empty contentType (see H9).
 */
function deriveContentType(app: string, contentCandidates: unknown[], typeEnum: string[]): string {
  if (contentCandidates.length !== 1) return "";
  const prefix = `${app}.`;
  const matches = typeEnum.filter((entry) => entry.startsWith(prefix));
  return matches.length === 1 ? matches[0] : "";
}

const CONTENT_FIELD_SKIP = new Set([
  "pulp_href",
  "pulp_created",
  "pulp_last_updated",
  "pulp_labels",
  "artifact",
  "artifacts",
]);
const MAX_CONTENT_FIELDS = 5;

/**
 * name and version first when present, then other properties in schema order, skipping the
 * common Pulp metadata fields and anything shaped as an array or object, capped at five. Falls
 * back to a single pulp_href column when nothing else qualifies.
 */
function buildContentFields(itemSchema: SchemaRecord | null): PulpContentField[] {
  const properties = schemaProperties(itemSchema);
  const ordered: string[] = [];
  for (const name of ["name", "version"]) {
    if (name in properties) ordered.push(name);
  }
  for (const [name, prop] of Object.entries(properties)) {
    if (ordered.includes(name) || CONTENT_FIELD_SKIP.has(name)) continue;
    const type = propType(prop);
    if (type === "array" || type === "object") continue;
    ordered.push(name);
  }
  const picked = ordered.slice(0, MAX_CONTENT_FIELDS);
  if (picked.length === 0) {
    return [{ name: "pulp_href", label: humanise("pulp_href") }];
  }
  return picked.map((name) => ({ name, label: humanise(name) }));
}

function stripPrefix(path: string): string {
  return path.startsWith(API_PREFIX) ? path.slice(API_PREFIX.length) : path;
}

/**
 * Turns a Pulp OpenAPI document into PulpPluginDescriptor values. Never throws: an unexpected
 * shape at any step just drops that field, that family, or the whole result.
 *
 * Families that this cannot derive well enough to be useful (no post operation on the
 * repository, no remote, no distribution) are skipped rather than included half-built. contentType
 * is frequently left "" and contentPath frequently picks the wrong endpoint for multi-endpoint
 * apps (see deriveContentType and the contentPath comment below) -- the curated overlay in
 * PULP_PLUGINS exists precisely to correct what cannot be derived reliably.
 */
export function derivePulpPlugins(spec: unknown): PulpPluginDescriptor[] {
  const root = asRecord(spec);
  const paths = asRecord(root?.paths);
  if (!paths) return [];
  const schemas = asRecord(asRecord(root?.components)?.schemas) ?? {};

  const repositories = listResourcePaths(paths, "repositories").filter(
    (entry) =>
      entry.app !== "core" && // core is the server itself, not a content family
      hasPostOperation(paths, entry.path) // e.g. container/container-push: created by `podman push`, not this UI
  );

  const remotesByApp = groupByApp(listResourcePaths(paths, "remotes"));
  const publicationsByApp = groupByApp(listResourcePaths(paths, "publications"));
  const distributionsByApp = groupByApp(listResourcePaths(paths, "distributions"));
  const contentByApp = groupByApp(listResourcePaths(paths, "content"));

  const remoteSchemas = [...remotesByApp.values()]
    .flat()
    .map((entry) => postRequestSchema(paths, schemas, entry.path))
    .filter((s): s is SchemaRecord => s !== null);
  // Excluded on top of the computed base: policy is a download-policy enum almost every remote
  // declares, but PulpRemoteField has no control for a string enum, so deriving it would render
  // a free-text box that lets a user post an invalid value. Deliberate exclusion, to revisit.
  const remoteExcluded = new Set([...commonPropertyNames(remoteSchemas), "policy"]);

  const repoSchemas = repositories
    .map((entry) => postRequestSchema(paths, schemas, entry.path))
    .filter((s): s is SchemaRecord => s !== null);
  const repoExcluded = commonPropertyNames(repoSchemas);

  const typeEnum = pulpTypeEnum(paths);

  const families: PulpPluginDescriptor[] = [];

  for (const repo of repositories) {
    const { app, type } = repo;
    const sameAppCount = repositories.filter((entry) => entry.app === app).length;
    const kind =
      type === app || sameAppCount === 1
        ? app
        : type.startsWith(`${app}-`)
          ? type
          : `${app}-${type}`;

    const remoteCandidates = remotesByApp.get(app) ?? [];
    const remotePath = pickPath(remoteCandidates, type, app);
    if (!remotePath) continue;

    const distributionCandidates = distributionsByApp.get(app) ?? [];
    const distributionPath = pickPath(distributionCandidates, type, app);
    if (!distributionPath) continue; // not derivable per spec: skip

    const publicationCandidates = publicationsByApp.get(app) ?? [];
    const publicationPath = pickPath(publicationCandidates, type, app);

    const contentCandidates = contentByApp.get(app) ?? [];
    // The app's content list paths sorted by type segment, first one. This is frequently the
    // wrong choice for a multi-endpoint app: rpm has 11 and sorting first gives advisories
    // rather than packages. Expected -- the curated overlay wins for those, and H9 turns this
    // into a list instead of a single guess.
    const chosenContent = chooseContentCandidate(contentCandidates);
    if (!chosenContent) continue;

    const syncKey = `{${app}_${type.replaceAll("-", "_")}_repository_href}sync/`;
    const supportsSync = syncKey in paths;
    const syncFields = supportsSync ? buildSyncFields(paths, schemas, syncKey) : [];

    const itemSchema = getResponseItemSchema(paths, schemas, chosenContent.path);
    const label = humanise(kind);

    const descriptor: PulpPluginDescriptor = {
      kind,
      label,
      article: /^[aeiou]/i.test(label) ? "an" : "a",
      repositoryPath: stripPrefix(repo.path),
      remotePath: stripPrefix(remotePath),
      remoteUrlPlaceholder: "https://",
      publicationPath: publicationPath ? stripPrefix(publicationPath) : null,
      distributionPath: stripPrefix(distributionPath),
      contentType: deriveContentType(app, contentCandidates, typeEnum),
      contentPath: stripPrefix(chosenContent.path),
      contentFields: buildContentFields(itemSchema),
      supportsPublish: publicationPath !== null,
      supportsSync,
      syncFields,
      extraRemoteFields: buildExtraRemoteFields(paths, schemas, remotePath, remoteExcluded),
      extraRepoFields: buildExtraRepoFields(paths, schemas, repo.path, repoExcluded),
    };
    if ("size" in schemaProperties(itemSchema)) {
      descriptor.contentSizeField = "size";
    }
    families.push(descriptor);
  }

  families.sort((a, b) => a.kind.localeCompare(b.kind));
  return families;
}
