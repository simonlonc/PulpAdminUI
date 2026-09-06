import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { findPulpPluginIn } from "@/lib/pulp-plugins";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import { normalizePulpHrefToApiPath, TaskRefResponse, waitForTask } from "../../_server";
import { isRepositoryVersionInstancePath, mapPulpRepositoryVersion } from "../../repository-version-map";

type DeleteBody = {
  pulp_href?: string;
};

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { kind } = await params;
  const plugin = findPulpPluginIn(await getPulpPluginRegistry(authResult.auth), kind);
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

  const detailResult = await pulpFetch<Record<string, unknown>>(apiPath, authResult.auth);

  if (!detailResult.ok) {
    if (detailResult.status === 401 || detailResult.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: detailResult.detail }, { status: detailResult.status });
  }

  return Response.json(mapPulpRepositoryVersion(detailResult.data));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { kind } = await params;
  const plugin = findPulpPluginIn(await getPulpPluginRegistry(authResult.auth), kind);
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

  const deleteResult = await pulpFetch<TaskRefResponse>(apiPath, authResult.auth, {
    method: "DELETE",
  });

  if (!deleteResult.ok) {
    if (deleteResult.status === 401 || deleteResult.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: deleteResult.detail }, { status: deleteResult.status });
  }

  if (deleteResult.data.task) {
    try {
      await waitForTask(deleteResult.data.task, authResult.auth);
    } catch (error) {
      return Response.json(
        { detail: error instanceof Error ? error.message : "Repository version delete task failed." },
        { status: 500 }
      );
    }
  }

  return Response.json({ ok: true });
}
