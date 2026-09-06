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
   * "string_list" fields are held as string[]; "string", "integer" and "json" fields are held
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
    } else if (field.type === "integer") {
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

export function parseConcurrency(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : null;
}

/** Parses an "integer" extra field. Unlike download concurrency, 0 is a valid value here. */
export function parseNullableInteger(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** The plugin's extra fields, coerced to the shapes Pulp expects. Assumes JSON fields already validated. */
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
    } else if (field.type === "integer") {
      // Null is rejected too, so a blank input leaves the field out and Pulp's default stands.
      const parsed = parseNullableInteger(typeof value === "string" ? value : "");
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
