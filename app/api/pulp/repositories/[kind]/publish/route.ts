import { pulpFetch } from "@/lib/pulp";
import { findPulpPluginIn } from "@/lib/pulp-plugins";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
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

export const POST = withPulpAuth(async (request, auth, { params }: { params: Promise<{ kind: string }> }) => {
  const { kind } = await params;
  const plugin = findPulpPluginIn(await getPulpPluginRegistry(auth), kind);
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

  const publishResult = await pulpFetch<TaskRefResponse>(plugin.publicationPath, auth, {
    method: "POST",
    body: JSON.stringify({
      repository,
      ...(plugin.publicationDefaults ?? {}),
    }),
  });

  if (!publishResult.ok) {
    throw new PulpApiError(publishResult.status, publishResult.detail);
  }

  const published = publishResult.data;
  let publicationHref = published.pulp_href ?? published.href ?? null;

  try {
    if (published.task) {
      const task = await waitForTask(published.task, auth);
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
});
