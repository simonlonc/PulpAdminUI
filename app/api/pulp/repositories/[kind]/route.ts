import { pulpFetch, type PulpAuth } from "@/lib/pulp";
import { findPulpPluginIn, type PulpPluginDescriptor } from "@/lib/pulp-plugins";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import { buildUpstreamListParams, normalizePulpHrefToApiPath, TaskRefResponse, waitForTask } from "../_server";

type PulpRepositoryRow = {
  name: string;
  pulp_href: string;
};

type PulpRepositoryListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: PulpRepositoryRow[];
};

type DeleteBody = {
  pulp_href?: string;
};

type RepositoryPatchBody = {
  pulp_href?: string;
  name?: string;
  description?: string | null;
  retain_repo_versions?: number | null;
  remote?: string | null;
  autopublish?: boolean;
  metadata_signing_service?: string | null;
  retain_package_versions?: number;
  metadata_checksum_type?: string | null;
  package_checksum_type?: string | null;
  gpgcheck?: number;
  repo_gpgcheck?: number;
  sqlite_metadata?: boolean;
  structured_repo?: boolean;
  manifest?: string | null;
};

function nullIfBlank(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

function toRetainRepoVersions(v: number | null | undefined): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toRetainPackageVersions(v: number | undefined): number {
  if (v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
}

function toGpgFlag(v: number | undefined): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return 1;
}

/** Common writable fields plus the plugin's extraRepoFields (see lib/pulp-plugins.ts). */
function buildPatchPayload(
  plugin: PulpPluginDescriptor,
  body: RepositoryPatchBody,
  name: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: name.trim(),
    description:
      body.description === undefined || body.description === null || body.description === ""
        ? null
        : String(body.description),
    retain_repo_versions: toRetainRepoVersions(body.retain_repo_versions),
    remote: nullIfBlank(body.remote ?? null),
  };

  for (const field of plugin.extraRepoFields) {
    switch (field) {
      case "autopublish":
        payload.autopublish = Boolean(body.autopublish);
        break;
      case "metadata_signing_service":
        payload.metadata_signing_service = nullIfBlank(body.metadata_signing_service ?? null);
        break;
      case "retain_package_versions":
        payload.retain_package_versions = toRetainPackageVersions(body.retain_package_versions);
        break;
      case "metadata_checksum_type":
        payload.metadata_checksum_type = nullIfBlank(body.metadata_checksum_type ?? null);
        break;
      case "package_checksum_type":
        payload.package_checksum_type = nullIfBlank(body.package_checksum_type ?? null);
        break;
      case "gpgcheck":
        payload.gpgcheck = toGpgFlag(body.gpgcheck);
        break;
      case "repo_gpgcheck":
        payload.repo_gpgcheck = toGpgFlag(body.repo_gpgcheck);
        break;
      case "sqlite_metadata":
        payload.sqlite_metadata = Boolean(body.sqlite_metadata);
        break;
      case "structured_repo":
        payload.structured_repo = Boolean(body.structured_repo);
        break;
      case "manifest":
        payload.manifest = nullIfBlank(body.manifest ?? null);
        break;
    }
  }

  return payload;
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
      response: Response.json({ detail: `Unknown repository kind: ${kind}` }, { status: 400 }),
    };
  }
  return { ok: true, plugin };
}

export const GET = withPulpAuth(async (request, auth, { params }: { params: Promise<{ kind: string }> }) => {
  const pluginResult = await resolvePlugin(params, auth);
  if (!pluginResult.ok) {
    return pluginResult.response;
  }
  const { plugin } = pluginResult;

  const url = new URL(request.url);
  const queryParams = buildUpstreamListParams(url.searchParams, ["remote"]);

  const result = await pulpFetch<PulpRepositoryListResponse>(
    `${plugin.repositoryPath}?${queryParams.toString()}`,
    auth
  );

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});

export const PATCH = withPulpAuth(async (request, auth, { params }: { params: Promise<{ kind: string }> }) => {
  const pluginResult = await resolvePlugin(params, auth);
  if (!pluginResult.ok) {
    return pluginResult.response;
  }
  const { plugin } = pluginResult;

  const body = (await request.json()) as RepositoryPatchBody;
  const pulpHref = body.pulp_href?.trim();
  const name = body.name?.trim();
  if (!pulpHref) {
    return Response.json({ detail: "pulp_href is required." }, { status: 400 });
  }
  if (!name) {
    return Response.json({ detail: "Repository name is required." }, { status: 400 });
  }

  const apiPath = normalizePulpHrefToApiPath(pulpHref);
  if (!apiPath.includes(plugin.repositoryPath)) {
    return Response.json({ detail: `Not ${plugin.article} ${plugin.label} repository href.` }, { status: 400 });
  }

  const patchPayload = buildPatchPayload(plugin, body, name);

  const patchResult = await pulpFetch<TaskRefResponse & { name?: string }>(apiPath, auth, {
    method: "PATCH",
    body: JSON.stringify(patchPayload),
  });

  if (!patchResult.ok) {
    throw new PulpApiError(patchResult.status, patchResult.detail);
  }

  if (patchResult.status === 202 && patchResult.data.task) {
    try {
      await waitForTask(patchResult.data.task, auth);
    } catch (error) {
      return Response.json(
        { detail: error instanceof Error ? error.message : "Repository update task failed." },
        { status: 500 }
      );
    }
  }

  const updatedName = patchResult.data.name;
  return Response.json({ ok: true, name: typeof updatedName === "string" ? updatedName : name });
});

export const DELETE = withPulpAuth(async (request, auth, { params }: { params: Promise<{ kind: string }> }) => {
  const pluginResult = await resolvePlugin(params, auth);
  if (!pluginResult.ok) {
    return pluginResult.response;
  }

  const body = (await request.json()) as DeleteBody;
  const pulpHref = body.pulp_href?.trim();
  if (!pulpHref) {
    return Response.json({ detail: "pulp_href is required." }, { status: 400 });
  }

  const apiPath = normalizePulpHrefToApiPath(pulpHref);
  const deleteResult = await pulpFetch<TaskRefResponse>(apiPath, auth, {
    method: "DELETE",
  });

  if (!deleteResult.ok) {
    throw new PulpApiError(deleteResult.status, deleteResult.detail);
  }

  if (deleteResult.data.task) {
    await waitForTask(deleteResult.data.task, auth);
  }

  return Response.json({ ok: true });
});
