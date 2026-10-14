import { pulpFetch, type PulpAuth } from "@/lib/pulp";
import { exportFileUrl, getExportHttpMapping } from "@/lib/export-http";
import { exportFileBasename, exportManifestEntries } from "@/lib/pulp-export-manifest";
import { PulpApiError, readJsonBody, withPulpAuth } from "@/app/api/pulp/_helpers";
import { getBaseApiPath, toPulpHrefPath } from "@/app/api/pulp/repositories/_server";
import type { PulpExport, PulpExportPublishFiles } from "@/services/pulp/types";
import { resolvePulpExportPath } from "../../../../_server";

// `exportId` is the export's full pulp_href, which already carries its exporter, so the [id]
// segment above it is not read here.
type PublishRouteContext = { params: Promise<{ id: string; exportId: string }> };

/** `{repository_path}{id}/` of a File repository, once the API base path is taken off. */
const FILE_REPOSITORY_PATH = /^\/repositories\/file\/file\/[^/]+\/$/;

/** A trimmed http(s) URL, or null for anything else. */
function parseHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  try {
    const protocol = new URL(trimmed).protocol;
    return protocol === "http:" || protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

/** The repository href Pulp expects in the content create body, or null for anything but a File repository. */
function toFileRepositoryHref(repository: unknown, auth: PulpAuth): string | null {
  if (typeof repository !== "string" || !repository.trim()) {
    return null;
  }

  let href: string;
  try {
    href = toPulpHrefPath(repository.trim(), auth);
  } catch {
    return null;
  }
  return FILE_REPOSITORY_PATH.test(href.slice(getBaseApiPath(auth).length)) ? href : null;
}

async function readExport(exportPath: string, auth: PulpAuth) {
  const result = await pulpFetch<PulpExport>(exportPath, auth);
  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }
  return result.data;
}

export const GET = withPulpAuth(async (_request: Request, auth, { params }: PublishRouteContext) => {
  const { exportId } = await params;
  const exportPath = resolvePulpExportPath(exportId);
  if (!exportPath) {
    return Response.json({ detail: "Invalid export identifier." }, { status: 400 });
  }

  const exportRow = await readExport(exportPath, auth);
  const mapping = getExportHttpMapping();
  const body: PulpExportPublishFiles = {
    configured: mapping !== null,
    files: exportManifestEntries(exportRow).map(({ path, checksum }) => ({
      path,
      checksum,
      file_url: mapping ? exportFileUrl(path, mapping) : null,
    })),
  };

  return Response.json(body);
});

export const POST = withPulpAuth(async (request: Request, auth, { params }: PublishRouteContext) => {
  const { exportId } = await params;
  const exportPath = resolvePulpExportPath(exportId);
  if (!exportPath) {
    return Response.json({ detail: "Invalid export identifier." }, { status: 400 });
  }

  const body = await readJsonBody(request);

  const repository = toFileRepositoryHref(body.repository, auth);
  if (!repository) {
    return Response.json({ detail: "repository must be a File repository href." }, { status: 400 });
  }

  // A file_url from the client wins; one that is present must be a usable http(s) URL.
  let fileUrl: string | null = null;
  if (body.file_url !== undefined && body.file_url !== null) {
    fileUrl = typeof body.file_url === "string" ? parseHttpUrl(body.file_url) : null;
    if (!fileUrl) {
      return Response.json({ detail: "file_url must be an http(s) URL." }, { status: 400 });
    }
  }

  // Only a file this export wrote can be published: the path is looked up in the export itself,
  // never taken from the client as is.
  const path = body.path;
  const exportRow = await readExport(exportPath, auth);
  if (typeof path !== "string" || !exportManifestEntries(exportRow).some((entry) => entry.path === path)) {
    return Response.json({ detail: "path is not a file of this export." }, { status: 400 });
  }

  const mapping = getExportHttpMapping();
  fileUrl ??= mapping ? exportFileUrl(path, mapping) : null;
  if (!fileUrl) {
    return Response.json(
      {
        detail:
          "No file_url: this app does not know where this file is served. Set PULP_EXPORT_HTTP_BASE_URL and PULP_EXPORT_HTTP_PATH_PREFIX on the app server, or enter the file_url by hand.",
      },
      { status: 400 }
    );
  }

  const result = await pulpFetch<{ task: string }>("/content/file/files/", auth, {
    method: "POST",
    body: JSON.stringify({
      file_url: fileUrl,
      relative_path: exportFileBasename(path),
      repository,
    }),
  });
  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  const { task } = result.data;

  // Dispatch-and-return: the Pulp worker's download of the file outlives an HTTP request, so the
  // task href goes back to the UI to link to on /tasks/detail instead.
  return Response.json({ task });
});
