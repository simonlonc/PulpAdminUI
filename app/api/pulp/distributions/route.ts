import { applyContentOrigin } from "@/lib/content-origin";
import { pulpFetch } from "@/lib/pulp";
import { findPulpPluginIn } from "@/lib/pulp-plugins";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { PulpApiError, withPulpAuth } from "../_helpers";
import {
  buildUpstreamListParams,
  toPulpHrefPath,
  TaskRefResponse,
} from "../repositories/_server";

type PulpDistribution = {
  pulp_href: string;
  pulp_created: string;
  base_path: string;
  base_url: string;
  content_guard: string | null;
  pulp_labels: Record<string, string>;
  name: string;
  repository: string | null;
};

type PulpListResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export const GET = withPulpAuth(async (request, auth) => {
  const url = new URL(request.url);
  const qs = buildUpstreamListParams(url.searchParams, ["repository"]);

  const result = await pulpFetch<PulpListResponse<PulpDistribution>>(
    `/distributions/?${qs.toString()}`,
    auth
  );
  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json({
    ...result.data,
    results: result.data.results.map((d) => ({ ...d, base_url: applyContentOrigin(d.base_url) })),
  });
});

type CreateBody = {
  kind?: string;
  name?: string;
  base_path?: string;
  repository?: string | null;
  publication?: string | null;
  content_guard?: string | null;
};

/**
 * Plain distribution create: always POSTs a new distribution for the given plugin kind,
 * bound to a repository, a publication, or neither, with an optional content guard.
 * Unlike [kind]/create/route.ts — the repositories page's "distribute this repository"
 * convenience flow, which finds a distribution already linked to the repository and
 * patches it instead of creating a duplicate — this route always creates.
 */
export const POST = withPulpAuth(async (request, auth) => {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ detail: "Invalid request body." }, { status: 400 });
  }

  const plugin = findPulpPluginIn(await getPulpPluginRegistry(auth), body.kind ?? "");
  if (!plugin) {
    return Response.json({ detail: `Unknown distribution kind: ${body.kind}` }, { status: 400 });
  }

  const name = body.name?.trim();
  const basePath = body.base_path?.trim();
  if (!name) {
    return Response.json({ detail: "Distribution name is required." }, { status: 400 });
  }
  if (!basePath) {
    return Response.json({ detail: "base_path is required." }, { status: 400 });
  }

  const createPayload: Record<string, unknown> = { name, base_path: basePath };
  if (body.repository) {
    createPayload.repository = toPulpHrefPath(body.repository);
  }
  if (body.publication) {
    createPayload.publication = toPulpHrefPath(body.publication);
  }
  if (body.content_guard) {
    createPayload.content_guard = toPulpHrefPath(body.content_guard);
  }

  const createResult = await pulpFetch<TaskRefResponse>(plugin.distributionPath, auth, {
    method: "POST",
    body: JSON.stringify(createPayload),
  });

  if (!createResult.ok) {
    throw new PulpApiError(createResult.status, createResult.detail);
  }

  const raw = createResult.data;

  // Dispatch-and-return: the task href goes back to the UI, which resolves the created
  // distribution from it and re-reads the detail for the fields only Pulp can fill.
  return Response.json({
    pulp_href: raw.pulp_href ?? raw.href ?? null,
    name,
    base_path: basePath,
    base_url: null,
    task: raw.task ?? null,
  });
});
