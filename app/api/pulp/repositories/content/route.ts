import { pulpFetch } from "@/lib/pulp";
import { findPluginForRepositoryHrefIn } from "@/lib/pulp-plugins";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import { extractNextApiPath, normalizePulpHrefToApiPath, PulpPaginatedJson } from "../_server";

type ContentRow = Record<string, unknown>;

function numOrNull(value: unknown): number | null {
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

async function loadAllPages(
  firstPath: string,
  auth: Parameters<typeof pulpFetch>[1]
): Promise<{ ok: true; rows: ContentRow[] } | { ok: false; status: number; detail: string }> {
  const allResults: ContentRow[] = [];
  let nextPath: string | null = firstPath;

  while (nextPath) {
    const result = await pulpFetch<PulpPaginatedJson<ContentRow>>(nextPath, auth);
    if (!result.ok) {
      return { ok: false, status: result.status, detail: result.detail };
    }
    allResults.push(...result.data.results);
    nextPath = extractNextApiPath(result.data.next);
  }

  return { ok: true, rows: allResults };
}

export const GET = withPulpAuth(async (request, auth) => {
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

  const apiRelative = normalizePulpHrefToApiPath(decodedHref);
  const basePath = apiRelative.endsWith("/") ? apiRelative : `${apiRelative}/`;

  const plugin = findPluginForRepositoryHrefIn(await getPulpPluginRegistry(auth), basePath);

  if (plugin) {
    // content_path names which of the family's endpoints to list; anything unrecognised falls
    // back to the first, the one the descriptor treats as the family's default.
    const requestedContentPath = url.searchParams.get("content_path")?.trim();
    const endpoint =
      plugin.contentEndpoints.find((e) => e.path === requestedContentPath) ??
      plugin.contentEndpoints[0];
    if (!endpoint) {
      return Response.json({ detail: "This plugin has no content endpoint." }, { status: 400 });
    }

    const repoResult = await pulpFetch<Record<string, unknown>>(basePath, auth);
    if (!repoResult.ok) {
      throw new PulpApiError(repoResult.status, repoResult.detail);
    }

    const latestVersionHref = repoResult.data.latest_version_href;
    if (typeof latestVersionHref !== "string" || latestVersionHref.length === 0) {
      return Response.json({ count: 0, totalSizeBytes: 0, results: [] });
    }

    const fields = ["pulp_href", "pulp_created", ...endpoint.fields.map((f) => f.name)];
    if (endpoint.sizeField) {
      fields.push(endpoint.sizeField);
    }

    const fieldsQuery = endpoint.fieldsQueryUnsupported ? "" : `&fields=${fields.join(",")}`;
    const contentPath = `${endpoint.path}?repository_version=${encodeURIComponent(
      latestVersionHref
    )}&limit=100${fieldsQuery}`;

    const pages = await loadAllPages(contentPath, auth);
    if (!pages.ok) {
      throw new PulpApiError(pages.status, pages.detail);
    }

    let totalSizeBytes: number | null = null;
    if (endpoint.sizeField) {
      const sizeField = endpoint.sizeField;
      totalSizeBytes = 0;
      for (const row of pages.rows) {
        totalSizeBytes += numOrNull(row[sizeField]) ?? 0;
      }
    }

    return Response.json({
      count: pages.rows.length,
      totalSizeBytes,
      results: pages.rows,
    });
  }

  const pages = await loadAllPages(`${basePath}content/`, auth);
  if (!pages.ok) {
    throw new PulpApiError(pages.status, pages.detail);
  }

  return Response.json({
    count: pages.rows.length,
    totalSizeBytes: null,
    results: pages.rows,
  });
});
