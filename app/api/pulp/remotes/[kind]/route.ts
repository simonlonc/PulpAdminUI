import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch, type PulpAuth } from "@/lib/pulp";
import { findPulpPluginIn, type PulpPluginDescriptor } from "@/lib/pulp-plugins";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import type { PulpRemote } from "@/services/pulp/types";
import {
  buildUpstreamListParams,
  normalizePulpHrefToApiPath,
  PulpPaginatedJson,
  TaskRefResponse,
  waitForTask,
} from "../../repositories/_server";

const REMOTE_POLICIES = ["immediate", "on_demand", "streamed"] as const;

type RemoteBody = {
  pulp_href?: string;
  name?: string;
  url?: string;
  policy?: string;
  tls_validation?: boolean;
  proxy_url?: string | null;
  username?: string | null;
  password?: string | null;
  ca_cert?: string | null;
  client_cert?: string | null;
  client_key?: string | null;
  download_concurrency?: number | null;
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t === "" ? null : t;
}

function normalizePolicy(value: unknown): (typeof REMOTE_POLICIES)[number] {
  if (typeof value === "string" && (REMOTE_POLICIES as readonly string[]).includes(value)) {
    return value as (typeof REMOTE_POLICIES)[number];
  }
  return "immediate";
}

function parseNullableConcurrency(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : null;
}

function isRemoteApiPath(plugin: PulpPluginDescriptor, path: string): boolean {
  return path.includes(plugin.remotePath);
}

/** Parses a "string_list" field. Pulp rejects null for these array fields, so blank is []. */
function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
}

/** Parses an "integer" field, or null when blank/absent. */
function parseNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Parses a "json" field: a JSON object, or null when blank/absent. Throws on invalid JSON. */
function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string" || value.trim() === "") return null;
  return JSON.parse(value) as Record<string, unknown>;
}

/**
 * Copy the plugin's extra remote fields out of the request body.
 * `onlySupplied` skips fields the caller omitted, which is what PATCH needs so an
 * untouched field is left alone. Returns a 400 response when a required field is blank.
 */
function assignExtraRemoteFields(
  target: Record<string, unknown>,
  plugin: PulpPluginDescriptor,
  body: RemoteBody,
  onlySupplied: boolean
): Response | null {
  const source = body as Record<string, unknown>;
  for (const field of plugin.extraRemoteFields) {
    if (onlySupplied && source[field.name] === undefined) {
      continue;
    }
    if (field.type === "boolean") {
      target[field.name] = Boolean(source[field.name]);
      continue;
    }
    if (field.type === "string_list") {
      const list = parseStringList(source[field.name]);
      if (field.required && list.length === 0) {
        return Response.json({ detail: `${field.label} is required.` }, { status: 400 });
      }
      target[field.name] = list;
      continue;
    }
    if (field.type === "integer") {
      // Pulp rejects null here, so a blank value leaves the field out and its default stands.
      const parsed = parseNullableInteger(source[field.name]);
      if (parsed !== null) {
        target[field.name] = parsed;
      }
      continue;
    }
    if (field.type === "json") {
      try {
        target[field.name] = parseJsonObject(source[field.name]);
      } catch {
        return Response.json(
          { detail: `${field.label} must be valid JSON.` },
          { status: 400 }
        );
      }
      continue;
    }
    const value = trimOrNull(source[field.name]);
    if (field.required && value === null) {
      return Response.json({ detail: `${field.label} is required.` }, { status: 400 });
    }
    target[field.name] = value;
  }
  return null;
}

/** Only include a secret in the payload when a non-empty value was supplied, so PATCH never clears it. */
function assignSecretIfPresent(
  target: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  const v = trimOrNull(value);
  if (v !== null) {
    target[key] = v;
  }
}

/** Resolve the {kind} segment to a plugin descriptor, or a 400 response when unknown. */
async function resolvePlugin(
  params: Promise<{ kind: string }>,
  auth: PulpAuth
): Promise<{ ok: true; plugin: PulpPluginDescriptor } | { ok: false; response: Response }> {
  const { kind } = await params;
  const plugin = findPulpPluginIn(await getPulpPluginRegistry(auth), kind);
  if (!plugin) {
    return {
      ok: false,
      response: Response.json({ detail: `Unknown remote kind: ${kind}` }, { status: 400 }),
    };
  }
  return { ok: true, plugin };
}

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const pluginResult = await resolvePlugin(params, authResult.auth);
  if (!pluginResult.ok) {
    return pluginResult.response;
  }
  const { plugin } = pluginResult;

  const url = new URL(request.url);
  const queryParams = buildUpstreamListParams(url.searchParams);

  const result = await pulpFetch<PulpPaginatedJson<PulpRemote>>(
    `${plugin.remotePath}?${queryParams.toString()}`,
    authResult.auth
  );

  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: result.detail }, { status: result.status });
  }

  return Response.json(result.data);
}

export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const pluginResult = await resolvePlugin(params, authResult.auth);
  if (!pluginResult.ok) {
    return pluginResult.response;
  }
  const { plugin } = pluginResult;

  const body = (await request.json()) as RemoteBody;
  const name = body.name?.trim();
  const remoteUrl = body.url?.trim();
  if (!name) {
    return Response.json({ detail: "Remote name is required." }, { status: 400 });
  }
  if (!remoteUrl) {
    return Response.json({ detail: "Remote URL is required." }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    name,
    url: remoteUrl,
    policy: normalizePolicy(body.policy),
    tls_validation: body.tls_validation === undefined ? true : Boolean(body.tls_validation),
    proxy_url: trimOrNull(body.proxy_url),
    ca_cert: trimOrNull(body.ca_cert),
    client_cert: trimOrNull(body.client_cert),
    download_concurrency: parseNullableConcurrency(body.download_concurrency),
  };
  const extraError = assignExtraRemoteFields(payload, plugin, body, false);
  if (extraError) {
    return extraError;
  }
  assignSecretIfPresent(payload, "username", body.username);
  assignSecretIfPresent(payload, "password", body.password);
  assignSecretIfPresent(payload, "client_key", body.client_key);

  const result = await pulpFetch<PulpRemote>(plugin.remotePath, authResult.auth, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: result.detail }, { status: result.status });
  }

  return Response.json(result.data);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const pluginResult = await resolvePlugin(params, authResult.auth);
  if (!pluginResult.ok) {
    return pluginResult.response;
  }
  const { plugin } = pluginResult;

  const body = (await request.json()) as RemoteBody;
  const pulpHref = body.pulp_href?.trim();
  if (!pulpHref) {
    return Response.json({ detail: "pulp_href is required." }, { status: 400 });
  }

  const apiPath = normalizePulpHrefToApiPath(pulpHref);
  if (!isRemoteApiPath(plugin, apiPath)) {
    return Response.json({ detail: `Not ${plugin.article} ${plugin.label} remote href.` }, { status: 400 });
  }

  const patchPayload: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return Response.json({ detail: "Remote name cannot be empty." }, { status: 400 });
    }
    patchPayload.name = name;
  }
  if (body.url !== undefined) {
    const remoteUrl = body.url.trim();
    if (!remoteUrl) {
      return Response.json({ detail: "Remote URL cannot be empty." }, { status: 400 });
    }
    patchPayload.url = remoteUrl;
  }
  if (body.policy !== undefined) {
    patchPayload.policy = normalizePolicy(body.policy);
  }
  if (body.tls_validation !== undefined) {
    patchPayload.tls_validation = Boolean(body.tls_validation);
  }
  if (body.proxy_url !== undefined) {
    patchPayload.proxy_url = trimOrNull(body.proxy_url);
  }
  if (body.ca_cert !== undefined) {
    patchPayload.ca_cert = trimOrNull(body.ca_cert);
  }
  if (body.client_cert !== undefined) {
    patchPayload.client_cert = trimOrNull(body.client_cert);
  }
  if (body.download_concurrency !== undefined) {
    patchPayload.download_concurrency = parseNullableConcurrency(body.download_concurrency);
  }
  const extraError = assignExtraRemoteFields(patchPayload, plugin, body, true);
  if (extraError) {
    return extraError;
  }
  // Secrets are only sent when a new value is supplied; omitting them leaves Pulp's stored value intact.
  assignSecretIfPresent(patchPayload, "username", body.username);
  assignSecretIfPresent(patchPayload, "password", body.password);
  assignSecretIfPresent(patchPayload, "client_key", body.client_key);

  if (Object.keys(patchPayload).length === 0) {
    return Response.json({ detail: "At least one field must be provided." }, { status: 400 });
  }

  const patchResult = await pulpFetch<TaskRefResponse>(apiPath, authResult.auth, {
    method: "PATCH",
    body: JSON.stringify(patchPayload),
  });

  if (!patchResult.ok) {
    if (patchResult.status === 401 || patchResult.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: patchResult.detail }, { status: patchResult.status });
  }

  if (patchResult.status === 202 && patchResult.data.task) {
    try {
      await waitForTask(patchResult.data.task, authResult.auth);
    } catch (error) {
      return Response.json(
        { detail: error instanceof Error ? error.message : "Remote update task failed." },
        { status: 500 }
      );
    }
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const pluginResult = await resolvePlugin(params, authResult.auth);
  if (!pluginResult.ok) {
    return pluginResult.response;
  }
  const { plugin } = pluginResult;

  const body = (await request.json()) as { pulp_href?: string };
  const pulpHref = body.pulp_href?.trim();
  if (!pulpHref) {
    return Response.json({ detail: "pulp_href is required." }, { status: 400 });
  }

  const apiPath = normalizePulpHrefToApiPath(pulpHref);
  if (!isRemoteApiPath(plugin, apiPath)) {
    return Response.json({ detail: `Not ${plugin.article} ${plugin.label} remote href.` }, { status: 400 });
  }

  const deleteResult = await pulpFetch<TaskRefResponse>(apiPath, authResult.auth, {
    method: "DELETE",
  });

  if (!deleteResult.ok) {
    if (deleteResult.status === 401 || deleteResult.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: deleteResult.detail }, { status: deleteResult.status });
  }

  if (deleteResult.status === 202 && deleteResult.data.task) {
    await waitForTask(deleteResult.data.task, authResult.auth);
  }

  return Response.json({ ok: true });
}
