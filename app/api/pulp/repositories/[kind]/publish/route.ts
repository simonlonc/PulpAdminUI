import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { findPulpPluginIn } from "@/lib/pulp-plugins";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import {
  normalizePulpHrefToApiPath,
  resolvePublicationHrefAfterTask,
  TaskRefResponse,
  toPulpHrefPath,
  waitForTask,
} from "../../_server";

type PublishBody = {
  pulp_href?: string;
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
  if (!plugin.supportsPublish || !plugin.publicationPath) {
    return Response.json(
      { detail: `${plugin.label} repositories cannot be published.` },
      { status: 400 }
    );
  }

  const body = (await request.json()) as PublishBody;
  const repoHref = body.pulp_href?.trim();
  if (!repoHref) {
    return Response.json({ detail: "Repository pulp_href is required." }, { status: 400 });
  }

  const repository = toPulpHrefPath(repoHref);

  const publishResult = await pulpFetch<TaskRefResponse>(plugin.publicationPath, authResult.auth, {
    method: "POST",
    body: JSON.stringify({
      repository,
      ...(plugin.publicationDefaults ?? {}),
    }),
  });

  if (!publishResult.ok) {
    if (publishResult.status === 401 || publishResult.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }
    return Response.json({ detail: publishResult.detail }, { status: publishResult.status });
  }

  const published = publishResult.data;
  let publicationHref = published.pulp_href ?? published.href ?? null;

  try {
    if (published.task) {
      const task = await waitForTask(published.task, authResult.auth);
      publicationHref = resolvePublicationHrefAfterTask(task, publicationHref);
    }
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "Publication task failed." },
      { status: 500 }
    );
  }

  return Response.json({
    publication: publicationHref,
    repository: normalizePulpHrefToApiPath(repoHref),
    task: published.task ?? null,
  });
}
