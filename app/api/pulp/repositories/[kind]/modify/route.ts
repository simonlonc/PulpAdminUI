import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { findPulpPluginIn } from "@/lib/pulp-plugins";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import { normalizePulpHrefToApiPath, toPulpHrefPath, waitForTask } from "../../_server";

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

  const modifyResult = await pulpFetch<{ task: string }>(`${apiPath}modify/`, authResult.auth, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!modifyResult.ok) {
    if (modifyResult.status === 401 || modifyResult.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: modifyResult.detail }, { status: modifyResult.status });
  }

  const { task } = modifyResult.data;

  try {
    const finished = await waitForTask(task, authResult.auth);
    return Response.json({ task, state: finished.state ?? "completed" });
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "Repository modify task failed." },
      { status: 500 }
    );
  }
}
