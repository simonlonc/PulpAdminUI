import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, readJsonBody, withPulpAuth } from "@/app/api/pulp/_helpers";
import type { PulpImporter, UpdatePulpImporterPayload } from "@/services/pulp/types";
import { readRepoMappingField, resolvePulpImporterPath } from "../_server";

export const GET = withPulpAuth(
  async (_request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const importerPath = resolvePulpImporterPath(id);
    if (!importerPath) {
      return Response.json({ detail: "Invalid importer identifier." }, { status: 400 });
    }

    const result = await pulpFetch<PulpImporter>(importerPath, auth);

    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    return Response.json(result.data);
  }
);

/** Importer update is synchronous (200 with the updated object), unlike an exporter's. */
export const PATCH = withPulpAuth(
  async (request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const importerPath = resolvePulpImporterPath(id);
    if (!importerPath) {
      return Response.json({ detail: "Invalid importer identifier." }, { status: 400 });
    }

    const body = await readJsonBody(request);

    const updatePayload: UpdatePulpImporterPayload = {};
    if (typeof body.name === "string") updatePayload.name = body.name.trim();
    const repoMapping = readRepoMappingField(body);
    if (repoMapping !== undefined) updatePayload.repo_mapping = repoMapping;

    if (Object.keys(updatePayload).length === 0) {
      return Response.json({ detail: "At least one importer field must be provided." }, { status: 400 });
    }

    const result = await pulpFetch<PulpImporter>(importerPath, auth, {
      method: "PATCH",
      body: JSON.stringify(updatePayload),
    });

    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    return Response.json(result.data);
  }
);

/** Importer delete is synchronous (204, no task href). */
export const DELETE = withPulpAuth(
  async (_request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const importerPath = resolvePulpImporterPath(id);
    if (!importerPath) {
      return Response.json({ detail: "Invalid importer identifier." }, { status: 400 });
    }

    const result = await pulpFetch(importerPath, auth, {
      method: "DELETE",
    });

    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    return Response.json({ ok: true });
  }
);
