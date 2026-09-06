import { pulpFetch } from "@/lib/pulp";
import { findPulpPluginIn } from "@/lib/pulp-plugins";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import { normalizePulpHrefToApiPath, TaskRefResponse, waitForTask } from "../../_server";
import { isRepositoryVersionInstancePath, mapPulpRepositoryVersion } from "../../repository-version-map";

type DeleteBody = {
  pulp_href?: string;
};

export const GET = withPulpAuth(async (request, auth, { params }: { params: Promise<{ kind: string }> }) => {
  const { kind } = await params;
  const plugin = findPulpPluginIn(await getPulpPluginRegistry(auth), kind);
  if (!plugin) {
    return Response.json({ detail: `Unknown repository kind: ${kind}` }, { status: 400 });
  }

  const url = new URL(request.url);
  const pulpHref = url.searchParams.get("pulp_href")?.trim();
  if (!pulpHref) {
    return Response.json({ detail: "Query pulp_href is required." }, { status: 400 });
  }

  let decodedHref: string;
  try {
    decodedHref = decodeURIComponent(pulpHref);
  } catch {
    decodedHref = pulpHref;
  }

  const apiPath = normalizePulpHrefToApiPath(decodedHref);
  if (!isRepositoryVersionInstancePath(apiPath, plugin.repositoryPath)) {
    return Response.json(
      {
        detail: `pulp_href must be a single ${plugin.label} repository version (…/versions/{number}/).`,
      },
      { status: 400 }
    );
  }

  const detailResult = await pulpFetch<Record<string, unknown>>(apiPath, auth);

  if (!detailResult.ok) {
    throw new PulpApiError(detailResult.status, detailResult.detail);
  }

  return Response.json(mapPulpRepositoryVersion(detailResult.data));
});

export const DELETE = withPulpAuth(async (request, auth, { params }: { params: Promise<{ kind: string }> }) => {
  const { kind } = await params;
  const plugin = findPulpPluginIn(await getPulpPluginRegistry(auth), kind);
  if (!plugin) {
    return Response.json({ detail: `Unknown repository kind: ${kind}` }, { status: 400 });
  }

  const body = (await request.json()) as DeleteBody;
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

  const deleteResult = await pulpFetch<TaskRefResponse>(apiPath, auth, {
    method: "DELETE",
  });

  if (!deleteResult.ok) {
    throw new PulpApiError(deleteResult.status, deleteResult.detail);
  }

  if (deleteResult.data.task) {
    try {
      await waitForTask(deleteResult.data.task, auth);
    } catch (error) {
      return Response.json(
        { detail: error instanceof Error ? error.message : "Repository version delete task failed." },
        { status: 500 }
      );
    }
  }

  return Response.json({ ok: true });
});
