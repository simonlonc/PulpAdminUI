import { cookies } from "next/headers";
import { getPulpApiUrl, PULP_AUTH_COOKIE, toBasicAuthHeader } from "@/lib/pulp";
import { findPulpPlugin } from "@/lib/pulp-plugins";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import { authHeaders, normalizePulpHrefToApiPath, readDetail, waitForTask } from "../../../_server";
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
  const plugin = findPulpPlugin(kind);
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

  const authHeader = toBasicAuthHeader(authResult.auth);
  const headers = authHeaders(authHeader);
  headers.set("Content-Type", "application/json");

  const verifyChecksums = body.verify_checksums ?? true;

  const repairResponse = await fetch(getPulpApiUrl(`${apiPath}repair/`), {
    method: "POST",
    headers,
    body: JSON.stringify({ verify_checksums: verifyChecksums }),
    cache: "no-store",
  });

  if (!repairResponse.ok) {
    if (repairResponse.status === 401 || repairResponse.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: await readDetail(repairResponse) }, { status: repairResponse.status });
  }

  const { task } = (await repairResponse.json()) as { task: string };

  try {
    const finished = await waitForTask(task, authHeader);
    return Response.json({ task, state: finished.state ?? "completed" });
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "Repository version repair task failed." },
      { status: 500 }
    );
  }
}
