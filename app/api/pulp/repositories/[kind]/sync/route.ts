import { cookies } from "next/headers";
import { getPulpApiUrl, PULP_AUTH_COOKIE, toBasicAuthHeader } from "@/lib/pulp";
import { findPulpPlugin } from "@/lib/pulp-plugins";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import {
  authHeaders,
  normalizePulpHrefToApiPath,
  readDetail,
  TaskRefResponse,
  toPulpHrefPath,
} from "../../_server";

const RPM_SYNC_POLICIES = ["additive", "mirror_complete", "mirror_content_only"] as const;

type SyncBody = {
  pulp_href?: string;
  remote?: string;
  sync_policy?: string;
  mirror?: boolean;
  optimize?: boolean;
};

function normalizeSyncPolicy(value: unknown): (typeof RPM_SYNC_POLICIES)[number] {
  if (typeof value === "string" && (RPM_SYNC_POLICIES as readonly string[]).includes(value)) {
    return value as (typeof RPM_SYNC_POLICIES)[number];
  }
  return "additive";
}

export async function POST(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { kind } = await params;
  const plugin = findPulpPlugin(kind);
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

  const authHeader = toBasicAuthHeader(authResult.auth);
  const headers = authHeaders(authHeader);
  headers.set("Content-Type", "application/json");

  // rpm uses the sync_policy enum; deb and file take mirror plus optimize; the families on the
  // core RepositorySyncURL (python, npm, gem) take mirror alone and reject optimize.
  const mirrorPayload = {
    remote: toPulpHrefPath(remoteHref),
    mirror: body.mirror === undefined ? false : Boolean(body.mirror),
  };
  const payload =
    plugin.syncFlavor === "sync_policy"
      ? {
          remote: toPulpHrefPath(remoteHref),
          sync_policy: normalizeSyncPolicy(body.sync_policy),
          optimize: body.optimize === undefined ? true : Boolean(body.optimize),
        }
      : plugin.syncFlavor === "mirror_only"
        ? mirrorPayload
        : {
            ...mirrorPayload,
            optimize: body.optimize === undefined ? true : Boolean(body.optimize),
          };

  const syncResponse = await fetch(getPulpApiUrl(syncApiPath), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!syncResponse.ok) {
    if (syncResponse.status === 401 || syncResponse.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: await readDetail(syncResponse) }, { status: syncResponse.status });
  }

  const dispatched = (await syncResponse.json()) as TaskRefResponse;

  // Sync is dispatch-and-return: a large first sync outlives waitForTask's 5-minute ceiling,
  // so the task href goes back to the UI to poll instead.
  return Response.json({
    repository: repoApiPath,
    task: dispatched.task ?? null,
  });
}
