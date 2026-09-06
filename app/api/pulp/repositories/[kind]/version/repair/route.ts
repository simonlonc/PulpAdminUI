import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { findPulpPluginIn } from "@/lib/pulp-plugins";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import { normalizePulpHrefToApiPath, waitForTask } from "../../../_server";
import { isRepositoryVersionInstancePath } from "../../../repository-version-map";

type RepairBody = {
  pulp_href?: string;
  verify_checksums?: boolean;
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

  const body = (await request.json()) as RepairBody;
  const pulpHref = body.pulp_href?.trim();
  if (!pulpHref) {
    return Response.json({ detail: "pulp_href is required." }, { status: 400 });
  }

  const apiPath = normalizePulpHrefToApiPath(pulpHref);
  if (!isRepositoryVersionInstancePath(apiPath, plugin.repositoryPath)) {
    return Response.json(
      {
        detail: `pulp_href must be a single ${plugin.label} repository version (…/versions/{number}/).`,
      },
      { status: 400 }
    );
  }

  const verifyChecksums = body.verify_checksums ?? true;

  const repairResult = await pulpFetch<{ task: string }>(`${apiPath}repair/`, authResult.auth, {
    method: "POST",
    body: JSON.stringify({ verify_checksums: verifyChecksums }),
  });

  if (!repairResult.ok) {
    if (repairResult.status === 401 || repairResult.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: repairResult.detail }, { status: repairResult.status });
  }

  const { task } = repairResult.data;

  try {
    const finished = await waitForTask(task, authResult.auth);
    return Response.json({ task, state: finished.state ?? "completed" });
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "Repository version repair task failed." },
      { status: 500 }
    );
  }
}
