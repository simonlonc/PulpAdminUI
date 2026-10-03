import { getBaseFieldHint, type PulpPluginDescriptor, type PulpRemoteField } from "@/lib/pulp-plugins";
import {
  PulpRemote,
  PulpRemotePolicy,
  RemoteCreatePayload,
  RemoteUpdatePayload,
} from "@/services/pulp/types";

export type RemoteFormState = {
  name: string;
  url: string;
  policy: PulpRemotePolicy;
  tls_validation: boolean;
  proxy_url: string;
  username: string;
  password: string;
  ca_cert: string;
  client_cert: string;
  client_key: string;
  download_concurrency: string;
  rate_limit: string;
  max_retries: string;
  connect_timeout: string;
  sock_connect_timeout: string;
  sock_read_timeout: string;
  total_timeout: string;
  proxy_username: string;
  proxy_password: string;
  /** The raw JSON text of Pulp's `headers`: an array of objects. */
  headers: string;
  /**
   * Plugin-specific fields, keyed by Pulp field name (see PulpPluginDescriptor.extraRemoteFields).
   * "string_list" fields are held as string[]; "string", "integer", "float" and "json" fields are held
   * as the raw text typed into their input, parsed when the payload is built.
   */
  extra: Record<string, string | boolean | string[]>;
};

/** The base remote fields held as typed numbers; `whole` is an integer, otherwise a float. */
export const REMOTE_TUNING_NUMBER_FIELDS = [
  { name: "rate_limit", label: "Rate limit", whole: true },
  { name: "max_retries", label: "Max retries", whole: true },
  { name: "connect_timeout", label: "Connect timeout", whole: false },
  { name: "sock_connect_timeout", label: "Socket connect timeout", whole: false },
  { name: "sock_read_timeout", label: "Socket read timeout", whole: false },
  { name: "total_timeout", label: "Total timeout", whole: false },
] as const;

type TuningNumberName = (typeof REMOTE_TUNING_NUMBER_FIELDS)[number]["name"];

/** Blank values for the current plugin's extra fields, so every input stays controlled. */
export function emptyExtraFields(
  plugin: PulpPluginDescriptor
): Record<string, string | boolean | string[]> {
  const extra: Record<string, string | boolean | string[]> = {};
  for (const field of plugin.extraRemoteFields) {
    extra[field.name] = field.type === "boolean" ? false : field.type === "string_list" ? [] : "";
  }
  return extra;
}

export function extraFieldsFromRemote(
  remote: PulpRemote,
  plugin: PulpPluginDescriptor
): Record<string, string | boolean | string[]> {
  const source = remote as Record<string, unknown>;
  const extra: Record<string, string | boolean | string[]> = {};
  for (const field of plugin.extraRemoteFields) {
    const value = source[field.name];
    if (field.type === "boolean") {
      extra[field.name] = Boolean(value);
    } else if (field.type === "string_list") {
      extra[field.name] = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
    } else if (field.type === "json") {
      extra[field.name] = value && typeof value === "object" ? JSON.stringify(value, null, 2) : "";
    } else if (field.type === "integer" || field.type === "float") {
      extra[field.name] = typeof value === "number" ? String(value) : "";
    } else {
      extra[field.name] = typeof value === "string" ? value : "";
    }
  }
  return extra;
}

export function emptyRemoteForm(plugin: PulpPluginDescriptor): RemoteFormState {
  return {
    name: "",
    url: "",
    policy: "immediate",
    tls_validation: true,
    proxy_url: "",
    username: "",
    password: "",
    ca_cert: "",
    client_cert: "",
    client_key: "",
    download_concurrency: "",
    rate_limit: "",
    max_retries: "",
    connect_timeout: "",
    sock_connect_timeout: "",
    sock_read_timeout: "",
    total_timeout: "",
    proxy_username: "",
    proxy_password: "",
    headers: "",
    extra: emptyExtraFields(plugin),
  };
}

function numberText(value: number | null | undefined): string {
  return typeof value === "number" ? String(value) : "";
}

export function formFromRemote(remote: PulpRemote, plugin: PulpPluginDescriptor): RemoteFormState {
  return {
    name: remote.name,
    url: remote.url,
    policy: remote.policy,
    tls_validation: remote.tls_validation,
    proxy_url: remote.proxy_url ?? "",
    // Secrets are never returned by Pulp; leave blank so an unchanged edit does not clear them.
    username: "",
    password: "",
    ca_cert: remote.ca_cert ?? "",
    client_cert: remote.client_cert ?? "",
    client_key: "",
    download_concurrency:
      remote.download_concurrency === null ? "" : String(remote.download_concurrency),
    rate_limit: numberText(remote.rate_limit),
    max_retries: numberText(remote.max_retries),
    connect_timeout: numberText(remote.connect_timeout),
    sock_connect_timeout: numberText(remote.sock_connect_timeout),
    sock_read_timeout: numberText(remote.sock_read_timeout),
    total_timeout: numberText(remote.total_timeout),
    // Pulp never returns the proxy credentials either; hidden_fields only says whether they are set.
    proxy_username: "",
    proxy_password: "",
    headers: remote.headers && remote.headers.length > 0 ? JSON.stringify(remote.headers, null, 2) : "",
    extra: extraFieldsFromRemote(remote, plugin),
  };
}

export function trimOrNull(value: string): string | null {
  const t = value.trim();
  return t === "" ? null : t;
}

/** A parsed numeric input: blank is `value: null` (leave Pulp's default alone), bad input is `ok: false`. */
export type NumberParse = { ok: true; value: number | null } | { ok: false };

const INTEGER_TEXT = /^[+-]?\d+$/;
const FLOAT_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** Parses a whole number: a safe integer at or above `minimum`, or blank. Anything else is not ok. */
export function parseIntegerInput(value: string, minimum?: number): NumberParse {
  const t = value.trim();
  if (t === "") return { ok: true, value: null };
  if (!INTEGER_TEXT.test(t)) return { ok: false };
  const n = Number(t);
  if (!Number.isSafeInteger(n) || (minimum !== undefined && n < minimum)) return { ok: false };
  return { ok: true, value: n };
}

/** Parses a decimal number: a finite value at or above `minimum`, or blank. Anything else is not ok. */
export function parseFloatInput(value: string, minimum?: number): NumberParse {
  const t = value.trim();
  if (t === "") return { ok: true, value: null };
  if (!FLOAT_TEXT.test(t)) return { ok: false };
  const n = Number(t);
  if (!Number.isFinite(n) || (minimum !== undefined && n < minimum)) return { ok: false };
  return { ok: true, value: n };
}

/** Download concurrency is a whole number of at least 1 (the spec's `minimum`). */
export const DOWNLOAD_CONCURRENCY_MINIMUM = 1;

/** The concurrency, or null when blank or invalid. Use `numericInputProblem` to tell those apart. */
export function parseConcurrency(value: string): number | null {
  const parsed = parseIntegerInput(value, DOWNLOAD_CONCURRENCY_MINIMUM);
  return parsed.ok ? parsed.value : null;
}

/** Parses an "integer" extra field, or null when blank or invalid. 0 is valid here unless the field has a minimum. */
export function parseNullableInteger(value: string, minimum?: number): number | null {
  const parsed = parseIntegerInput(value, minimum);
  return parsed.ok ? parsed.value : null;
}

/** Parses a "float" extra field, or null when blank or invalid. */
export function parseNullableFloat(value: string, minimum?: number): number | null {
  const parsed = parseFloatInput(value, minimum);
  return parsed.ok ? parsed.value : null;
}

export function numericProblem(label: string, whole: boolean, minimum?: number): string {
  const kind = whole ? "a whole number" : "a number";
  return minimum === undefined
    ? `${label} must be ${kind}.`
    : `${label} must be ${kind} of at least ${minimum}.`;
}

/** The headers as an array of objects, or null when blank or not that shape. */
function parseHeaders(value: string): Record<string, unknown>[] | null {
  const t = value.trim();
  if (t === "") return null;
  try {
    const parsed: unknown = JSON.parse(t);
    if (
      Array.isArray(parsed) &&
      parsed.every((h) => typeof h === "object" && h !== null && !Array.isArray(h))
    ) {
      return parsed as Record<string, unknown>[];
    }
  } catch {
    // not JSON: reported by headersProblem
  }
  return null;
}

/** A message when the headers text is not a JSON array of objects, or null when blank or valid. */
export function headersProblem(form: RemoteFormState): string | null {
  if (form.headers.trim() === "") return null;
  return parseHeaders(form.headers) === null ? "Headers must be a JSON array of objects." : null;
}

/** The minimum for a tuning number field: the spec's, via its hint (none for rate_limit and max_retries). */
function tuningMinimum(plugin: PulpPluginDescriptor, name: TuningNumberName): number | undefined {
  return getBaseFieldHint(plugin, name).minimum;
}

/** The first bad download concurrency or tuning number, as a message, or null. */
function tuningNumberProblem(form: RemoteFormState, plugin: PulpPluginDescriptor): string | null {
  if (!parseIntegerInput(form.download_concurrency, DOWNLOAD_CONCURRENCY_MINIMUM).ok) {
    return numericProblem("Download concurrency", true, DOWNLOAD_CONCURRENCY_MINIMUM);
  }
  for (const field of REMOTE_TUNING_NUMBER_FIELDS) {
    const minimum = tuningMinimum(plugin, field.name);
    const parsed = field.whole
      ? parseIntegerInput(form[field.name], minimum)
      : parseFloatInput(form[field.name], minimum);
    if (!parsed.ok) return numericProblem(field.label, field.whole, minimum);
  }
  return null;
}

/**
 * The message for a bad value in the Advanced section (download concurrency, the tuning numbers,
 * the headers), or null. The modal compares it with its error to keep the section open.
 */
export function advancedInputProblem(
  form: RemoteFormState,
  plugin: PulpPluginDescriptor
): string | null {
  return tuningNumberProblem(form, plugin) ?? headersProblem(form);
}

/**
 * How many Advanced section fields hold a value: the typed text, plus the write-only secrets Pulp
 * reports as set (`hidden_fields`) on the remote being edited.
 */
export function advancedSetCount(form: RemoteFormState, editing: PulpRemote | null): number {
  const typed = [
    form.download_concurrency,
    ...REMOTE_TUNING_NUMBER_FIELDS.map((field) => form[field.name]),
    form.headers,
    form.ca_cert,
    form.client_cert,
  ].filter((text) => text.trim() !== "").length;
  const secrets: [string, string][] = [
    ["proxy_username", form.proxy_username],
    ["proxy_password", form.proxy_password],
    ["client_key", form.client_key],
  ];
  const secretsSet = secrets.filter(
    ([name, text]) =>
      text.trim() !== "" || editing?.hidden_fields?.some((h) => h.name === name && h.is_set)
  ).length;
  return typed + secretsSet;
}

/**
 * A message for the first numeric input (download concurrency, the tuning numbers, then the
 * plugin's "integer" and "float" extra fields) that holds text which is not valid, or null when
 * all are valid or blank. Without it a bad value parses to null and is dropped from the payload,
 * so the save looks fine.
 */
export function numericInputProblem(
  form: RemoteFormState,
  plugin: PulpPluginDescriptor
): string | null {
  const tuningProblem = tuningNumberProblem(form, plugin);
  if (tuningProblem) return tuningProblem;
  for (const field of plugin.extraRemoteFields) {
    if (field.type !== "integer" && field.type !== "float") continue;
    const value = form.extra[field.name];
    const text = typeof value === "string" ? value : "";
    const parsed =
      field.type === "integer"
        ? parseIntegerInput(text, field.minimum)
        : parseFloatInput(text, field.minimum);
    if (!parsed.ok) return numericProblem(field.label, field.type === "integer", field.minimum);
  }
  return null;
}

/** The tuning numbers as Pulp expects them: a number, or null for blank (clears on edit). Assumes validated. */
function tuningNumbersPayload(
  form: RemoteFormState,
  plugin: PulpPluginDescriptor
): Record<TuningNumberName, number | null> {
  const payload = {} as Record<TuningNumberName, number | null>;
  for (const field of REMOTE_TUNING_NUMBER_FIELDS) {
    const minimum = tuningMinimum(plugin, field.name);
    payload[field.name] = field.whole
      ? parseNullableInteger(form[field.name], minimum)
      : parseNullableFloat(form[field.name], minimum);
  }
  return payload;
}

/** The plugin's extra fields, coerced to the shapes Pulp expects. Assumes JSON and numeric fields already validated. */
export function extraFieldsPayload(
  form: RemoteFormState,
  plugin: PulpPluginDescriptor
): Partial<RemoteCreatePayload> {
  const payload: Record<string, unknown> = {};
  for (const field of plugin.extraRemoteFields) {
    const value = form.extra[field.name];
    if (field.type === "boolean") {
      payload[field.name] = Boolean(value);
    } else if (field.type === "string_list") {
      // Pulp rejects null for these array fields; an empty array is how they are cleared.
      payload[field.name] = Array.isArray(value) ? value.filter((v) => v.trim() !== "") : [];
    } else if (field.type === "integer" || field.type === "float") {
      // Null is rejected too, so a blank input leaves the field out and Pulp's default stands.
      const text = typeof value === "string" ? value : "";
      const parsed =
        field.type === "integer"
          ? parseNullableInteger(text, field.minimum)
          : parseNullableFloat(text, field.minimum);
      if (parsed !== null) {
        payload[field.name] = parsed;
      }
    } else if (field.type === "json") {
      const text = typeof value === "string" ? value.trim() : "";
      payload[field.name] = text === "" ? null : JSON.parse(text);
    } else {
      payload[field.name] = trimOrNull(typeof value === "string" ? value : "");
    }
  }
  return payload as Partial<RemoteCreatePayload>;
}

/** The extra fields that must be filled in before the form can be submitted. */
export function missingRequiredExtraField(
  form: RemoteFormState,
  plugin: PulpPluginDescriptor
): PulpRemoteField | null {
  for (const field of plugin.extraRemoteFields) {
    if (!field.required) continue;
    const value = form.extra[field.name];
    if (field.type === "boolean") continue;
    if (field.type === "string_list") {
      if (!Array.isArray(value) || value.filter((v) => v.trim() !== "").length === 0) {
        return field;
      }
      continue;
    }
    if (typeof value !== "string" || value.trim() === "") {
      return field;
    }
  }
  return null;
}

/** The first "json" extra field whose typed text is not valid JSON, or null when all are valid. */
export function invalidJsonExtraField(
  form: RemoteFormState,
  plugin: PulpPluginDescriptor
): PulpRemoteField | null {
  for (const field of plugin.extraRemoteFields) {
    if (field.type !== "json") continue;
    const value = form.extra[field.name];
    const text = typeof value === "string" ? value.trim() : "";
    if (text === "") continue;
    try {
      JSON.parse(text);
    } catch {
      return field;
    }
  }
  return null;
}

export function formToCreatePayload(
  form: RemoteFormState,
  plugin: PulpPluginDescriptor
): RemoteCreatePayload {
  const payload: RemoteCreatePayload = {
    name: form.name.trim(),
    url: form.url.trim(),
    policy: form.policy,
    tls_validation: form.tls_validation,
    proxy_url: trimOrNull(form.proxy_url),
    username: trimOrNull(form.username),
    password: trimOrNull(form.password),
    ca_cert: trimOrNull(form.ca_cert),
    client_cert: trimOrNull(form.client_cert),
    client_key: trimOrNull(form.client_key),
    download_concurrency: parseConcurrency(form.download_concurrency),
    ...tuningNumbersPayload(form, plugin),
    // Pulp rejects a null `headers`, so blank is an empty array.
    headers: parseHeaders(form.headers) ?? [],
    proxy_username: trimOrNull(form.proxy_username),
    proxy_password: trimOrNull(form.proxy_password),
    ...extraFieldsPayload(form, plugin),
  };
  return payload;
}

export function formToUpdatePayload(
  form: RemoteFormState,
  plugin: PulpPluginDescriptor
): RemoteUpdatePayload {
  const payload: RemoteUpdatePayload = {
    name: form.name.trim(),
    url: form.url.trim(),
    policy: form.policy,
    tls_validation: form.tls_validation,
    proxy_url: trimOrNull(form.proxy_url),
    ca_cert: trimOrNull(form.ca_cert),
    client_cert: trimOrNull(form.client_cert),
    download_concurrency: parseConcurrency(form.download_concurrency),
    ...tuningNumbersPayload(form, plugin),
    headers: parseHeaders(form.headers) ?? [],
    ...extraFieldsPayload(form, plugin),
  };
  // Only send secrets when the user typed a new value; blank means "leave unchanged".
  const username = form.username.trim();
  const password = form.password.trim();
  const clientKey = form.client_key.trim();
  const proxyUsername = form.proxy_username.trim();
  const proxyPassword = form.proxy_password.trim();
  if (proxyUsername) payload.proxy_username = proxyUsername;
  if (proxyPassword) payload.proxy_password = proxyPassword;
  if (username) payload.username = username;
  if (password) payload.password = password;
  if (clientKey) payload.client_key = clientKey;
  return payload;
}
