import { cookies } from "next/headers";
import { getPulpApiUrl, PULP_AUTH_COOKIE, toBasicAuthHeader } from "@/lib/pulp";
import { findPulpPluginIn } from "@/lib/pulp-plugins";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import {
  authHeaders,
  normalizePulpHrefToApiPath,
  readDetail,
  toPulpHrefPath,
  waitForTask,
} from "../../_server";

type ModifyBody = {
  pulp_href?: string;
  add_content_units?: string[];
  remove_content_units?: string[];
  base_version?: string;
  overwrite?: boolean;
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

  const body = (await request.json()) as ModifyBody;
  const repoHref = body.pulp_href?.trim();
  if (!repoHref) {
    return Response.json({ detail: "Repository pulp_href is required." }, { status: 400 });
  }

  const apiPath = normalizePulpHrefToApiPath(repoHref);
  if (!apiPath.startsWith(plugin.repositoryPath)) {
    return Response.json({ detail: `Not ${plugin.article} ${plugin.label} repository href.` }, { status: 400 });
  }

  const addContentUnits = (body.add_content_units ?? []).map((h) => h.trim()).filter(Boolean);
  const removeContentUnits = (body.remove_content_units ?? []).map((h) => h.trim()).filter(Boolean);
  const baseVersion = body.base_version?.trim();

  if (addContentUnits.length === 0 && removeContentUnits.length === 0 && !baseVersion) {
    return Response.json(
      { detail: "Provide at least one of add_content_units, remove_content_units, or base_version." },
      { status: 400 }
    );
  }

  const authHeader = toBasicAuthHeader(authResult.auth);
  const headers = authHeaders(authHeader);
  headers.set("Content-Type", "application/json");

  const payload: Record<string, unknown> = {};
  if (addContentUnits.length > 0) {
    payload.add_content_units = addContentUnits.map((h) => toPulpHrefPath(h));
  }
  if (removeContentUnits.length > 0) {
    payload.remove_content_units = removeContentUnits.map((h) => (h === "*" ? h : toPulpHrefPath(h)));
  }
  if (baseVersion) {
    payload.base_version = toPulpHrefPath(baseVersion);
  }
  if (body.overwrite !== undefined) {
    payload.overwrite = body.overwrite;
  }

  const modifyResponse = await fetch(getPulpApiUrl(`${apiPath}modify/`), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!modifyResponse.ok) {
    if (modifyResponse.status === 401 || modifyResponse.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: await readDetail(modifyResponse) }, { status: modifyResponse.status });
  }

  const { task } = (await modifyResponse.json()) as { task: string };

  try {
    const finished = await waitForTask(task, authHeader);
    return Response.json({ task, state: finished.state ?? "completed" });
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "Repository modify task failed." },
      { status: 500 }
    );
  }
}
