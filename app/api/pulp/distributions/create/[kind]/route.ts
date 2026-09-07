import { pulpFetch, type PulpAuth } from "@/lib/pulp";
import { findPulpPluginIn, type PulpPluginDescriptor } from "@/lib/pulp-plugins";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import {
  normalizePulpHrefToApiPath,
  TaskRefResponse,
  toPulpHrefPath,
} from "@/app/api/pulp/repositories/_server";

type CreateBody = {
  repository?: string;
  name?: string;
  base_path?: string;
};

type PulpDistribution = {
  pulp_href: string;
  base_url: string;
  base_path: string;
  name: string;
  repository: string | null;
};

function isPluginRepositoryPath(plugin: PulpPluginDescriptor, path: string): boolean {
  return path.includes(plugin.repositoryPath);
}

function repoRefKey(href: string): string {
  return normalizePulpHrefToApiPath(href).replace(/\/+$/, "");
}

type DistListResult = {
  results: Array<{ pulp_href: string; repository: string | null }>;
};

async function findFirstLinkedDistributionHref(
  plugin: PulpPluginDescriptor,
  repoHref: string,
  auth: PulpAuth
): Promise<
  | { ok: true; pulp_href: string | null }
  | { ok: false; status: number; detail: string }
> {
  const want = repoRefKey(repoHref);
  // Ask Pulp to filter server-side instead of paging through every distribution of this family.
  const repositoryParam = encodeURIComponent(toPulpHrefPath(repoHref));
  const listPath = `${plugin.distributionPath}?repository=${repositoryParam}&limit=1`;

  const pageResult = await pulpFetch<DistListResult>(listPath, auth);
  if (!pageResult.ok) {
    return { ok: false, status: pageResult.status, detail: pageResult.detail };
  }
  const row = pageResult.data.results[0];
  if (row && row.repository && repoRefKey(row.repository) === want) {
    return { ok: true, pulp_href: row.pulp_href };
  }

  return { ok: true, pulp_href: null };
}

function finalizeDistributionWrite(
  pulpHref: string | null,
  fallbackName: string,
  fallbackBasePath: string,
  taskHref: string | null
): Response {
  // Dispatch-and-return: the task href goes back to the UI, which resolves the written
  // distribution from it and re-reads the detail for the fields only Pulp can fill.
  return Response.json({
    name: fallbackName,
    pulp_href: pulpHref,
    base_url: null,
    base_path: fallbackBasePath,
    task: taskHref,
  });
}

export const POST = withPulpAuth(
  async (request: Request, auth, { params }: { params: Promise<{ kind: string }> }) => {
    const { kind } = await params;
    const plugin = findPulpPluginIn(await getPulpPluginRegistry(auth), kind);
    if (!plugin) {
      return Response.json({ detail: `Unknown distribution kind: ${kind}` }, { status: 400 });
    }

    const body = (await request.json()) as CreateBody;
    const repoHref = body.repository?.trim();
    const name = body.name?.trim();
    const basePath = body.base_path?.trim();

    if (!repoHref) {
      return Response.json({ detail: "repository (pulp_href) is required." }, { status: 400 });
    }
    if (!name) {
      return Response.json({ detail: "Distribution name is required." }, { status: 400 });
    }
    if (!basePath) {
      return Response.json({ detail: "base_path is required." }, { status: 400 });
    }

    const apiPath = normalizePulpHrefToApiPath(repoHref);
    if (!isPluginRepositoryPath(plugin, apiPath)) {
      return Response.json(
        {
          detail: `Only ${plugin.label} repository hrefs can be bound to ${plugin.article} ${plugin.label} distribution.`,
        },
        { status: 400 }
      );
    }

    const repositoryField = toPulpHrefPath(repoHref);

    const linked = await findFirstLinkedDistributionHref(plugin, repoHref, auth);
    if (!linked.ok) {
      throw new PulpApiError(linked.status, linked.detail);
    }

    if (linked.pulp_href) {
      const patchPath = normalizePulpHrefToApiPath(linked.pulp_href);
      const patchResult = await pulpFetch<TaskRefResponse>(patchPath, auth, {
        method: "PATCH",
        body: JSON.stringify({ name, base_path: basePath }),
      });

      if (!patchResult.ok) {
        throw new PulpApiError(patchResult.status, patchResult.detail);
      }

      const taskHref = patchResult.data.task ?? null;

      return finalizeDistributionWrite(linked.pulp_href, name, basePath, taskHref);
    }

    const createResult = await pulpFetch<TaskRefResponse & Partial<PulpDistribution>>(
      plugin.distributionPath,
      auth,
      {
        method: "POST",
        body: JSON.stringify({
          name,
          base_path: basePath,
          repository: repositoryField,
        }),
      }
    );

    if (!createResult.ok) {
      throw new PulpApiError(createResult.status, createResult.detail);
    }

    const raw = createResult.data;
    const pulpHref = raw.pulp_href ?? raw.href ?? null;

    return finalizeDistributionWrite(pulpHref, name, basePath, raw.task ?? null);
  }
);
