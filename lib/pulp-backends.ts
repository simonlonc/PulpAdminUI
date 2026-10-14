/**
 * The list of Pulp servers ("backends") a user can pick at login, kept in a JSON file named by
 * the PULP_BACKENDS_FILE environment variable (default data/pulp-backends.json, resolved against
 * the working directory). The file is a JSON array of { id, label, baseUrl, createdAt } and holds
 * no secrets: per-user credentials stay in the session cookie, as they always did.
 *
 * A deployment that never adopts the feature sees no change. When the file is absent or empty,
 * the list is one "default" entry synthesized from PULP_BASE_URL and PULP_PROJECT_NAME, and no
 * list at all when PULP_BASE_URL is unset. The first write materializes that entry into the file,
 * so sessions that name the "default" backend stay valid.
 *
 * The file is edited by hand as well as by this module, so individual bad entries are skipped
 * with a warning. A file that cannot be read or parsed as an array at all is different: it
 * throws instead of falling back, because this list decides where logins send credentials and a
 * corrupt one must not quietly redirect them to the PULP_BASE_URL server.
 *
 * Server-side only: reads and writes the filesystem, so this must not be imported from client
 * code. The file is re-read on every call, so a hand edit takes effect without a restart.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { logError, logWarn } from "@/lib/log";

export type PulpBackend = {
  id: string;
  label: string;
  baseUrl: string;
  createdAt: string;
};

/** The id of the backend synthesized from PULP_BASE_URL, and what a session without one means. */
export const DEFAULT_PULP_BACKEND_ID = "default";

const DEFAULT_FILE = "data/pulp-backends.json";
const MAX_LABEL_LENGTH = 100;

type JsonRecord = Record<string, unknown>;

type BackendInput = { label?: unknown; baseUrl?: unknown };

/** A validated value, or the sentence that tells the caller what to fix. */
type Checked<T> = { ok: true; value: T } | { ok: false; detail: string };

type AddResult = { ok: true; backend: PulpBackend } | { ok: false; status: 400; detail: string };
type UpdateResult =
  | { ok: true; backend: PulpBackend }
  | { ok: false; status: 400 | 404; detail: string };

function asRecord(value: unknown): JsonRecord | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function storeFile(): string {
  // The comment stops Turbopack from tracing the whole working directory into the standalone build.
  return resolve(/* turbopackIgnore: true */ process.cwd(), process.env.PULP_BACKENDS_FILE?.trim() || DEFAULT_FILE);
}

function checkLabel(value: unknown): Checked<string> {
  if (!isNonEmptyString(value)) {
    return { ok: false, detail: "Label must be a non-empty string." };
  }
  const label = value.trim();
  if (label.length > MAX_LABEL_LENGTH) {
    return { ok: false, detail: `Label must be at most ${MAX_LABEL_LENGTH} characters.` };
  }
  return { ok: true, value: label };
}

/**
 * The normalized form of an http(s) base URL: no trailing slash, and none of the parts that could
 * carry a secret or change what a request path means. Rejects instead of stripping them, so the
 * user sees that what they typed is not what would be stored.
 */
export function checkPulpBackendBaseUrl(value: unknown): Checked<string> {
  if (!isNonEmptyString(value)) {
    return { ok: false, detail: "Base URL must be a non-empty string." };
  }
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return { ok: false, detail: "Base URL is not a valid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, detail: "Base URL must start with http:// or https://." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, detail: "Base URL must not contain a username or password." };
  }
  if (parsed.search || parsed.hash) {
    return { ok: false, detail: "Base URL must not contain a query string or a fragment." };
  }
  return { ok: true, value: `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "") };
}

/**
 * Validates the editable fields of an add (both required) or an update (`partial`: any subset,
 * but at least one). A field an update leaves out is simply absent from the result.
 */
function checkInput(
  input: BackendInput,
  partial: boolean
): Checked<Partial<Pick<PulpBackend, "label" | "baseUrl">>> {
  if (partial && input.label === undefined && input.baseUrl === undefined) {
    return { ok: false, detail: "Provide a label or a base URL to update." };
  }
  const fields: Partial<Pick<PulpBackend, "label" | "baseUrl">> = {};
  if (!partial || input.label !== undefined) {
    const label = checkLabel(input.label);
    if (!label.ok) return label;
    fields.label = label.value;
  }
  if (!partial || input.baseUrl !== undefined) {
    const baseUrl = checkPulpBackendBaseUrl(input.baseUrl);
    if (!baseUrl.ok) return baseUrl;
    fields.baseUrl = baseUrl.value;
  }
  return { ok: true, value: fields };
}

/** Validates one parsed array element, keeping only the four known keys. */
function readEntry(
  value: unknown
): { ok: true; backend: PulpBackend } | { ok: false; problem: string } {
  const record = asRecord(value);
  if (!record) return { ok: false, problem: "must be an object" };
  if (!isNonEmptyString(record.id)) return { ok: false, problem: 'needs a non-empty string "id"' };
  if (!isNonEmptyString(record.label)) {
    return { ok: false, problem: 'needs a non-empty string "label"' };
  }
  const baseUrl = checkPulpBackendBaseUrl(record.baseUrl);
  if (!baseUrl.ok) return { ok: false, problem: `has an unusable "baseUrl": ${baseUrl.detail}` };
  if (typeof record.createdAt !== "string") {
    return { ok: false, problem: 'needs a string "createdAt"' };
  }
  return {
    ok: true,
    backend: { id: record.id, label: record.label, baseUrl: baseUrl.value, createdAt: record.createdAt },
  };
}

/**
 * What PULP_BASE_URL alone describes. The trimming mirrors getPulpBaseUrl in lib/pulp.ts, which
 * is not called here because it throws when the variable is unset and "unset" is a normal state.
 */
function fallbackBackends(): PulpBackend[] {
  const baseUrl = process.env.PULP_BASE_URL?.trim().replace(/\/+$/, "");
  if (!baseUrl) return [];
  return [
    {
      id: DEFAULT_PULP_BACKEND_ID,
      label: process.env.PULP_PROJECT_NAME?.trim() || "Pulp",
      baseUrl,
      createdAt: new Date().toISOString(),
    },
  ];
}

function unusable(file: string, reason: string): never {
  logError("pulp_backends_file_unusable", { file, message: reason });
  throw new Error(`Cannot use the Pulp server list ${file}: ${reason}`);
}

async function readBackends(file: string): Promise<PulpBackend[]> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return fallbackBackends();
    return unusable(file, error instanceof Error ? error.message : String(error));
  }
  if (text.trim().length === 0) return fallbackBackends();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return unusable(file, `it is not valid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!Array.isArray(parsed)) return unusable(file, "it must contain a JSON array");
  if (parsed.length === 0) return fallbackBackends();

  const backends: PulpBackend[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < parsed.length; index += 1) {
    const read = readEntry(parsed[index]);
    if (!read.ok) {
      logWarn("pulp_backends_entry_invalid", { file, index, problem: read.problem });
      continue;
    }
    if (seen.has(read.backend.id)) {
      logWarn("pulp_backends_entry_duplicate", { file, index, id: read.backend.id });
      continue;
    }
    seen.add(read.backend.id);
    backends.push(read.backend);
  }
  return backends;
}

/**
 * Replaces the file in one step: the temp file sits in the same directory so the rename stays on
 * one filesystem, and a reader (or a crash) sees either the old list or the new one, never half.
 */
async function writeBackends(file: string, backends: readonly PulpBackend[]): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(backends, null, 2)}\n`, "utf8");
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/** Tail of the write chain. Always fulfilled (see mutate), so one failure never blocks the rest. */
let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * Runs a read-modify-write of the list behind every earlier one. The read happens inside the
 * queued step, so two concurrent saves each start from the other's result instead of both from
 * the same stale list. `next: null` means nothing to write (the change found nothing to do).
 * In-process only: two server processes sharing one file can still overwrite each other.
 *
 * When the file was absent the list read here includes the synthesized default entry, so
 * writing `next` materializes it and never drops the env server.
 */
function mutate<T>(
  change: (backends: readonly PulpBackend[]) => { next: PulpBackend[] | null; result: T }
): Promise<T> {
  // Resolved now, not when the queue reaches this step, so a call writes where it was aimed.
  const file = storeFile();
  const run = writeQueue.then(async () => {
    const { next, result } = change(await readBackends(file));
    if (next) await writeBackends(file, next);
    return result;
  });
  writeQueue = run.catch(() => undefined);
  return run;
}

export async function listPulpBackends(): Promise<PulpBackend[]> {
  return readBackends(storeFile());
}

export async function getPulpBackend(id: string): Promise<PulpBackend | null> {
  const backends = await listPulpBackends();
  return backends.find((backend) => backend.id === id) ?? null;
}

export async function addPulpBackend(input: BackendInput): Promise<AddResult> {
  const checked = checkInput(input, false);
  if (!checked.ok) return { ok: false, status: 400, detail: checked.detail };

  const backend: PulpBackend = {
    id: randomUUID(),
    // Both fields are required when not partial, so checkInput has set both.
    ...(checked.value as Pick<PulpBackend, "label" | "baseUrl">),
    createdAt: new Date().toISOString(),
  };
  await mutate((backends) => ({ next: [...backends, backend], result: undefined }));
  return { ok: true, backend };
}

export async function updatePulpBackend(id: string, input: BackendInput): Promise<UpdateResult> {
  const checked = checkInput(input, true);
  if (!checked.ok) return { ok: false, status: 400, detail: checked.detail };

  return mutate<UpdateResult>((backends) => {
    const current = backends.find((backend) => backend.id === id);
    if (!current) {
      return { next: null, result: { ok: false, status: 404, detail: "Pulp server not found." } };
    }
    const backend: PulpBackend = { ...current, ...checked.value };
    return {
      next: backends.map((entry) => (entry.id === id ? backend : entry)),
      result: { ok: true, backend },
    };
  });
}

/**
 * Whether a backend with this id existed and was removed. Removing the last entry writes [],
 * which reads back as the fallback: with PULP_BASE_URL set, the env server is listed again.
 */
export async function removePulpBackend(id: string): Promise<boolean> {
  return mutate((backends) => {
    const remaining = backends.filter((backend) => backend.id !== id);
    if (remaining.length === backends.length) return { next: null, result: false };
    return { next: remaining, result: true };
  });
}
