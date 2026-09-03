import { cookies } from "next/headers";
import { getPulpApiUrl, PULP_AUTH_COOKIE, pulpFetch, toBasicAuthHeader } from "@/lib/pulp";
import { findPulpPlugin, type PulpPluginDescriptor } from "@/lib/pulp-plugins";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import type { PulpRemote } from "@/services/pulp/types";
import {
  authHeaders,
  buildUpstreamListParams,
  normalizePulpHrefToApiPath,
  PulpPaginatedJson,
  readDetail,
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
  distributions?: string | null;
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
  params: Promise<{ kind: string }>
): Promise<{ ok: true; plugin: PulpPluginDescriptor } | { ok: false; response: Response }> {
  const { kind } = await params;
  const plugin = findPulpPlugin(kind);
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

  const pluginResult = await resolvePlugin(params);
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

  const pluginResult = await resolvePlugin(params);
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
  if (plugin.extraRemoteFields.includes("distributions")) {
    payload.distributions = trimOrNull(body.distributions);
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

  const pluginResult = await resolvePlugin(params);
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
  if (plugin.extraRemoteFields.includes("distributions") && body.distributions !== undefined) {
    patchPayload.distributions = trimOrNull(body.distributions);
  }
  // Secrets are only sent when a new value is supplied; omitting them leaves Pulp's stored value intact.
  assignSecretIfPresent(patchPayload, "username", body.username);
  assignSecretIfPresent(patchPayload, "password", body.password);
  assignSecretIfPresent(patchPayload, "client_key", body.client_key);

  if (Object.keys(patchPayload).length === 0) {
    return Response.json({ detail: "At least one field must be provided." }, { status: 400 });
  }

  const authHeader = toBasicAuthHeader(authResult.auth);
  const headers = authHeaders(authHeader);
  headers.set("Content-Type", "application/json");

  const patchResponse = await fetch(getPulpApiUrl(apiPath), {
    method: "PATCH",
    headers,
    body: JSON.stringify(patchPayload),
    cache: "no-store",
  });

  if (patchResponse.status === 202) {
    const ct = patchResponse.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      try {
        const raw = await patchResponse.text();
        if (raw) {
          const payload = JSON.parse(raw) as TaskRefResponse;
          if (payload.task) {
            await waitForTask(payload.task, authHeader);
          }
        }
      } catch (error) {
        return Response.json(
          { detail: error instanceof Error ? error.message : "Remote update task failed." },
          { status: 500 }
        );
      }
    }
    return Response.json({ ok: true });
  }

  if (patchResponse.ok) {
    return Response.json({ ok: true });
  }

  if (patchResponse.status === 401 || patchResponse.status === 403) {
    const cookieStore = await cookies();
    cookieStore.delete(PULP_AUTH_COOKIE);
  }
  return Response.json({ detail: await readDetail(patchResponse) }, { status: patchResponse.status });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const pluginResult = await resolvePlugin(params);
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

  const authHeader = toBasicAuthHeader(authResult.auth);
  const deleteResponse = await fetch(getPulpApiUrl(apiPath), {
    method: "DELETE",
    headers: authHeaders(authHeader),
    cache: "no-store",
  });

  if (deleteResponse.status === 202) {
    const ct = deleteResponse.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const payload = (await deleteResponse.json()) as TaskRefResponse;
      if (payload.task) {
        await waitForTask(payload.task, authHeader);
      }
    }
    return Response.json({ ok: true });
  }

  if (deleteResponse.status === 204 || deleteResponse.ok) {
    return Response.json({ ok: true });
  }

  if (deleteResponse.status === 401 || deleteResponse.status === 403) {
    const cookieStore = await cookies();
    cookieStore.delete(PULP_AUTH_COOKIE);
  }
  return Response.json({ detail: await readDetail(deleteResponse) }, { status: deleteResponse.status });
}
