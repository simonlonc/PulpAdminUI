import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, readJsonBody, withPulpAuth } from "@/app/api/pulp/_helpers";
import { buildUpstreamListParams } from "@/app/api/pulp/repositories/_server";
import type { PulpImport, PulpPaginatedResponse, RunPulpImportPayload } from "@/services/pulp/types";
import { resolvePulpImporterPath } from "../../_server";

export const GET = withPulpAuth(
  async (request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const importerPath = resolvePulpImporterPath(id);
    if (!importerPath) {
      return Response.json({ detail: "Invalid importer identifier." }, { status: 400 });
    }

    // Pulp's import list only accepts limit/offset, so the rest of the list allowlist is dropped.
    const listParams = buildUpstreamListParams(new URL(request.url).searchParams);
    const qs = new URLSearchParams({
      limit: listParams.get("limit") ?? "",
      offset: listParams.get("offset") ?? "",
    });

    const result = await pulpFetch<PulpPaginatedResponse<PulpImport>>(
      `${importerPath}imports/?${qs.toString()}`,
      auth
    );
    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    return Response.json(result.data);
  }
);

export const POST = withPulpAuth(
  async (request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const importerPath = resolvePulpImporterPath(id);
    if (!importerPath) {
      return Response.json({ detail: "Invalid importer identifier." }, { status: 400 });
    }

    const body = await readJsonBody(request);

    // Only the fields that are present and of the right type are forwarded. Both paths are on the
    // Pulp host, and Pulp checks them against its ALLOWED_IMPORT_PATHS setting.
    const importPayload: RunPulpImportPayload = {};
    if (typeof body.path === "string" && body.path.trim()) importPayload.path = body.path.trim();
    if (typeof body.toc === "string" && body.toc.trim()) importPayload.toc = body.toc.trim();
    if (typeof body.create_repositories === "boolean") {
      importPayload.create_repositories = body.create_repositories;
    }

    if (!importPayload.path && !importPayload.toc) {
      return Response.json(
        { detail: "An import path or a table-of-contents file is required." },
        { status: 400 }
      );
    }

    const importResult = await pulpFetch<{ task_group: string }>(`${importerPath}imports/`, auth, {
      method: "POST",
      body: JSON.stringify(importPayload),
    });

    if (!importResult.ok) {
      throw new PulpApiError(importResult.status, importResult.detail);
    }

    const { task_group } = importResult.data;

    // Dispatch-and-return: an import runs one task per repository and outlives an HTTP request, so
    // the task group href goes back to the UI to link to on /task-groups/detail. It is not
    // coerced into the single `task` the other dispatch routes return.
    return Response.json({ task_group });
  }
);
