/**
 * Reads the deployment's own plugin overlay: a directory of JSON files named by the
 * PULP_PLUGIN_DIR environment variable, each holding one partial (or complete)
 * PulpPluginDescriptor. It is the highest-priority tier of the registry -- above the derived
 * descriptors and the curated PULP_PLUGINS -- so a deployment can correct or add a family
 * without rebuilding the bundle.
 *
 * The files are JSON, never JavaScript: nothing here evaluates, imports or requires a
 * user-supplied path, because the registry is built inside an authenticated admin session.
 *
 * The files come from outside this code, so every step validates its input and skips (rather
 * than throws) on anything that does not match the expected shape. loadPulpPluginOverlay()
 * returns whatever entries it could load, possibly none: a bad overlay directory degrades to
 * the registry the UI would have had without it.
 *
 * Server-side only: reads the filesystem, so this must not be imported from client code. The
 * directory is re-read on every registry build, so editing a file takes effect within the
 * registry's existing 10-minute TTL and needs no restart.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { PulpPluginDescriptor } from "@/lib/pulp-plugins";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** Describes the first problem with a value, or null when it is acceptable. */
type Validator = (value: unknown) => string | null;

/** Applies an entry validator to every element of an array, reporting the first problem. */
function arrayProblem(key: string, value: unknown, entryProblem: Validator): string | null {
  if (!Array.isArray(value)) return `"${key}" must be an array`;
  for (let index = 0; index < value.length; index += 1) {
    const problem = entryProblem(value[index]);
    if (problem) return `"${key}"[${index}] ${problem}`;
  }
  return null;
}

const SYNC_FIELD_TYPES = new Set(["boolean", "enum", "string_list"]);
const REMOTE_FIELD_TYPES = new Set(["string", "boolean", "string_list", "integer", "json"]);

function contentEndpointProblem(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return "must be an object";
  if (!isNonEmptyString(record.path)) return 'needs a non-empty string "path"';
  if (typeof record.label !== "string") return 'needs a string "label"';
  if (typeof record.contentType !== "string") return 'needs a string "contentType"';
  const fields = arrayProblem("fields", record.fields, (field) => {
    const entry = asRecord(field);
    if (!entry) return "must be an object";
    if (typeof entry.name !== "string") return 'needs a string "name"';
    if (typeof entry.label !== "string") return 'needs a string "label"';
    return null;
  });
  if (fields) return fields;
  if (record.sizeField !== undefined && typeof record.sizeField !== "string") {
    return '"sizeField" must be a string';
  }
  if (record.fieldsQueryUnsupported !== undefined && record.fieldsQueryUnsupported !== true) {
    return '"fieldsQueryUnsupported" must be true when present';
  }
  return null;
}

function syncFieldProblem(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return "must be an object";
  if (!isNonEmptyString(record.name)) return 'needs a non-empty string "name"';
  if (typeof record.type !== "string" || !SYNC_FIELD_TYPES.has(record.type)) {
    return `needs a "type" of ${[...SYNC_FIELD_TYPES].join(", ")}`;
  }
  if (typeof record.label !== "string") return 'needs a string "label"';
  if (
    record.default !== undefined &&
    typeof record.default !== "boolean" &&
    typeof record.default !== "string"
  ) {
    return '"default" must be a boolean or a string';
  }
  if (record.options !== undefined && !isStringArray(record.options)) {
    return '"options" must be an array of strings';
  }
  if (record.optionLabels !== undefined) {
    const labels = asRecord(record.optionLabels);
    if (!labels) return '"optionLabels" must be an object';
    if (!Object.values(labels).every((label) => typeof label === "string")) {
      return '"optionLabels" values must be strings';
    }
  }
  return null;
}

function remoteFieldProblem(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return "must be an object";
  if (!isNonEmptyString(record.name)) return 'needs a non-empty string "name"';
  if (typeof record.type !== "string" || !REMOTE_FIELD_TYPES.has(record.type)) {
    return `needs a "type" of ${[...REMOTE_FIELD_TYPES].join(", ")}`;
  }
  if (typeof record.label !== "string") return 'needs a string "label"';
  if (record.required !== undefined && record.required !== true) {
    return '"required" must be true when present';
  }
  if (record.placeholder !== undefined && typeof record.placeholder !== "string") {
    return '"placeholder" must be a string';
  }
  if (record.options !== undefined && !isStringArray(record.options)) {
    return '"options" must be an array of strings';
  }
  return null;
}

function nonEmptyStringValidator(key: string): Validator {
  return (value) => (isNonEmptyString(value) ? null : `"${key}" must be a non-empty string`);
}

function booleanValidator(key: string): Validator {
  return (value) => (typeof value === "boolean" ? null : `"${key}" must be a boolean`);
}

/**
 * One validator per descriptor key, so a key an overlay file does not mention is simply left to
 * the tier below. Typed by keyof PulpPluginDescriptor so a new descriptor key does not silently
 * become an "unknown key" here.
 */
const KEY_VALIDATORS: Record<keyof PulpPluginDescriptor, Validator> = {
  kind: nonEmptyStringValidator("kind"),
  label: nonEmptyStringValidator("label"),
  article: (value) => (value === "a" || value === "an" ? null : '"article" must be "a" or "an"'),
  repositoryPath: nonEmptyStringValidator("repositoryPath"),
  remotePath: nonEmptyStringValidator("remotePath"),
  remoteUrlPlaceholder: nonEmptyStringValidator("remoteUrlPlaceholder"),
  publicationPath: (value) =>
    value === null || typeof value === "string" ? null : '"publicationPath" must be a string or null',
  distributionPath: nonEmptyStringValidator("distributionPath"),
  contentEndpoints: (value) => arrayProblem("contentEndpoints", value, contentEndpointProblem),
  supportsPublish: booleanValidator("supportsPublish"),
  supportsSync: booleanValidator("supportsSync"),
  publicationDefaults: (value) =>
    asRecord(value) ? null : '"publicationDefaults" must be an object',
  syncFields: (value) => arrayProblem("syncFields", value, syncFieldProblem),
  extraRemoteFields: (value) => arrayProblem("extraRemoteFields", value, remoteFieldProblem),
  extraRepoFields: (value) =>
    isStringArray(value) ? null : '"extraRepoFields" must be an array of strings',
};

const DESCRIPTOR_KEYS = new Set(Object.keys(KEY_VALIDATORS));

/** Every descriptor key but publicationDefaults, the type's only optional one. */
const REQUIRED_KEYS: readonly (keyof PulpPluginDescriptor)[] = [
  "kind",
  "label",
  "article",
  "repositoryPath",
  "remotePath",
  "remoteUrlPlaceholder",
  "publicationPath",
  "distributionPath",
  "contentEndpoints",
  "supportsPublish",
  "supportsSync",
  "syncFields",
  "extraRemoteFields",
  "extraRepoFields",
];

/**
 * Whether a validated overlay entry stands on its own, i.e. carries every required key. Only a
 * complete entry can introduce a kind no other tier has -- see lib/pulp-plugin-registry.ts.
 */
export function isCompleteDescriptor(
  entry: Partial<PulpPluginDescriptor>
): entry is PulpPluginDescriptor {
  return REQUIRED_KEYS.every((key) => entry[key] !== undefined);
}

/**
 * Validates one parsed overlay file into the entry the registry applies, keeping only the keys
 * this UI knows. A top-level key it does not know is reported in `ignored` rather than rejecting
 * the file, so an overlay written for a newer UI still loads here.
 */
function readOverlayEntry(
  value: unknown
): { ok: true; entry: Partial<PulpPluginDescriptor>; ignored: string[] } | { ok: false; problem: string } {
  const record = asRecord(value);
  if (!record) return { ok: false, problem: "must contain a JSON object" };
  if (!isNonEmptyString(record.kind)) {
    return { ok: false, problem: '"kind" must be a non-empty string' };
  }

  const entry: JsonRecord = {};
  const ignored: string[] = [];
  for (const [key, keyValue] of Object.entries(record)) {
    if (!DESCRIPTOR_KEYS.has(key)) {
      ignored.push(key);
      continue;
    }
    const problem = KEY_VALIDATORS[key as keyof PulpPluginDescriptor](keyValue);
    if (problem) return { ok: false, problem };
    entry[key] = keyValue;
  }
  return { ok: true, entry: entry as Partial<PulpPluginDescriptor>, ignored };
}

/**
 * Loads the overlay entries from PULP_PLUGIN_DIR, in filename order, at most one per kind (the
 * later filename wins). Returns [] when the variable is unset or empty -- the normal case -- and
 * when the directory cannot be read. Never throws.
 */
export async function loadPulpPluginOverlay(): Promise<readonly Partial<PulpPluginDescriptor>[]> {
  const directory = process.env.PULP_PLUGIN_DIR?.trim();
  if (!directory) return [];

  let names: string[];
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    names = entries
      .filter((entry) => !entry.isDirectory() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    console.error(`loadPulpPluginOverlay: cannot read PULP_PLUGIN_DIR (${directory}):`, error);
    return [];
  }

  const byKind = new Map<string, Partial<PulpPluginDescriptor>>();

  for (const name of names) {
    const file = join(directory, name);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      console.error(`loadPulpPluginOverlay: skipping ${file}:`, error);
      continue;
    }

    const read = readOverlayEntry(parsed);
    if (!read.ok) {
      console.error(`loadPulpPluginOverlay: skipping ${file}: ${read.problem}`);
      continue;
    }
    if (read.ignored.length > 0) {
      console.error(
        `loadPulpPluginOverlay: ${file}: ignoring unknown key(s) ${read.ignored.join(", ")}`
      );
    }

    const entry = read.entry;
    const kind = entry.kind as string;
    if (byKind.has(kind)) {
      console.error(`loadPulpPluginOverlay: ${file} replaces an earlier entry for kind "${kind}"`);
    }
    byKind.set(kind, entry);
  }

  return [...byKind.values()];
}
