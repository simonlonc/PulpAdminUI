import { pulpFetch } from "@/lib/pulp";
import { findPulpPluginIn } from "@/lib/pulp-plugins";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import { normalizePulpHrefToApiPath, waitForTask } from "../../../_server";
import { isRepositoryVersionInstancePath } from "../../../repository-version-map";

type RepairBody = {
  pulp_href?: string;
  verify_checksums?: boolean;
};

export const POST = withPulpAuth(async (request, auth, { params }: { params: Promise<{ kind: string }> }) => {
  const { kind } = await params;
  const plugin = findPulpPluginIn(await getPulpPluginRegistry(auth), kind);
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

  const repairResult = await pulpFetch<{ task: string }>(`${apiPath}repair/`, auth, {
    method: "POST",
    body: JSON.stringify({ verify_checksums: verifyChecksums }),
  });

  if (!repairResult.ok) {
    throw new PulpApiError(repairResult.status, repairResult.detail);
  }

  const { task } = repairResult.data;

  try {
    const finished = await waitForTask(task, auth);
    return Response.json({ task, state: finished.state ?? "completed" });
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "Repository version repair task failed." },
      { status: 500 }
    );
  }
});
