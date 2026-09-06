import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { findPulpPluginIn } from "@/lib/pulp-plugins";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import { normalizePulpHrefToApiPath, TaskRefResponse, toPulpHrefPath } from "../../_server";

type SyncBody = {
  pulp_href?: string;
  remote?: string;
  fields?: Record<string, unknown>;
};

export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { kind } = await params;
  const plugin = findPulpPluginIn(await getPulpPluginRegistry(authResult.auth), kind);
  if (!plugin) {
    return Response.json({ detail: `Unknown repository kind: ${kind}` }, { status: 400 });
  }
  if (!plugin.supportsSync) {
    return Response.json({ detail: `${plugin.label} repositories cannot be synced.` }, { status: 400 });
  }

  const body = (await request.json()) as SyncBody;
  const repoHref = body.pulp_href?.trim();
  const remoteHref = body.remote?.trim();
  if (!repoHref) {
    return Response.json({ detail: "Repository pulp_href is required." }, { status: 400 });
  }
  if (!remoteHref) {
    return Response.json({ detail: "A remote is required to sync." }, { status: 400 });
  }

  const repoApiPath = normalizePulpHrefToApiPath(repoHref);
  if (!repoApiPath.includes(plugin.repositoryPath)) {
    return Response.json({ detail: `Not ${plugin.article} ${plugin.label} repository href.` }, { status: 400 });
  }

  const syncApiPath = `${repoApiPath.replace(/\/$/, "")}/sync/`;

  // The body carries exactly the fields this plugin's sync schema declares, coerced by type; a
  // name the plugin does not declare is dropped rather than forwarded for the server to reject.
  const sent = body.fields ?? {};
  const payload: Record<string, unknown> = { remote: toPulpHrefPath(remoteHref) };
  for (const field of plugin.syncFields) {
    const value = sent[field.name];
    if (field.type === "boolean") {
      payload[field.name] = value === undefined ? (field.default ?? false) : Boolean(value);
      continue;
    }
    const options = field.options ?? [];
    if (options.length === 0) continue;
    if (field.type === "enum") {
      payload[field.name] =
        typeof value === "string" && options.includes(value) ? value : (field.default ?? options[0]);
      continue;
    }
    // string_list: an empty selection is the schema default, so leave the field out entirely.
    const selected = Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string" && options.includes(v))
      : [];
    if (selected.length > 0) payload[field.name] = selected;
  }

  const syncResult = await pulpFetch<TaskRefResponse>(syncApiPath, authResult.auth, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!syncResult.ok) {
    if (syncResult.status === 401 || syncResult.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: syncResult.detail }, { status: syncResult.status });
  }

  const dispatched = syncResult.data;

  // Sync is dispatch-and-return: a large first sync outlives waitForTask's 5-minute ceiling,
  // so the task href goes back to the UI to poll instead.
  return Response.json({
    repository: repoApiPath,
    task: dispatched.task ?? null,
  });
}
