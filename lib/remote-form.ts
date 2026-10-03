import { type PulpPluginDescriptor, type PulpRemoteField } from "@/lib/pulp-plugins";
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
  /**
   * Plugin-specific fields, keyed by Pulp field name (see PulpPluginDescriptor.extraRemoteFields).
   * "string_list" fields are held as string[]; "string", "integer", "float" and "json" fields are held
   * as the raw text typed into their input, parsed when the payload is built.
   */
  extra: Record<string, string | boolean | string[]>;
};

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
    extra: emptyExtraFields(plugin),
  };
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

function numericProblem(label: string, whole: boolean, minimum?: number): string {
  const kind = whole ? "a whole number" : "a number";
  return minimum === undefined
    ? `${label} must be ${kind}.`
    : `${label} must be ${kind} of at least ${minimum}.`;
}

/**
 * A message for the first numeric input (download concurrency, then the plugin's "integer" and
 * "float" extra fields) that holds text which is not valid, or null when all are valid or blank.
 * Without it a bad value parses to null and is dropped from the payload, so the save looks fine.
 */
export function numericInputProblem(
  form: RemoteFormState,
  plugin: PulpPluginDescriptor
): string | null {
  if (!parseIntegerInput(form.download_concurrency, DOWNLOAD_CONCURRENCY_MINIMUM).ok) {
    return numericProblem("Download concurrency", true, DOWNLOAD_CONCURRENCY_MINIMUM);
  }
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
    ...extraFieldsPayload(form, plugin),
  };
  // Only send secrets when the user typed a new value; blank means "leave unchanged".
  const username = form.username.trim();
  const password = form.password.trim();
  const clientKey = form.client_key.trim();
  if (username) payload.username = username;
  if (password) payload.password = password;
  if (clientKey) payload.client_key = clientKey;
  return payload;
}
