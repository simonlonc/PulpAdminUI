import { pulpFetch } from "@/lib/pulp";
import { findPulpPluginIn } from "@/lib/pulp-plugins";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import { normalizePulpHrefToApiPath, TaskRefResponse, toPulpHrefPath } from "../../_server";

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

  // Dispatch-and-return: publication is set only when Pulp answered synchronously, otherwise the
  // task href goes back to the UI to poll and resolve the publication from.
  return Response.json({
    publication: published.pulp_href ?? published.href ?? null,
    repository: normalizePulpHrefToApiPath(repoHref),
    task: published.task ?? null,
  });
});
