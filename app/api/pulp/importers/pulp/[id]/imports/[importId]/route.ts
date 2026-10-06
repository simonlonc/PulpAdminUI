import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import type { PulpImport } from "@/services/pulp/types";
import { resolvePulpImportPath } from "../../../_server";

// `importId` is the import's full pulp_href, which already carries its importer, so the [id]
// segment above it is not read here.
type ImportRouteContext = { params: Promise<{ id: string; importId: string }> };

export const GET = withPulpAuth(async (_request: Request, auth, { params }: ImportRouteContext) => {
  const { importId } = await params;
  const importPath = resolvePulpImportPath(importId);
  if (!importPath) {
    return Response.json({ detail: "Invalid import identifier." }, { status: 400 });
  }

  const result = await pulpFetch<PulpImport>(importPath, auth);

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});

/** Import delete is synchronous (204, no task href). */
export const DELETE = withPulpAuth(async (_request: Request, auth, { params }: ImportRouteContext) => {
  const { importId } = await params;
  const importPath = resolvePulpImportPath(importId);
  if (!importPath) {
    return Response.json({ detail: "Invalid import identifier." }, { status: 400 });
  }

  const result = await pulpFetch(importPath, auth, {
    method: "DELETE",
  });

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json({ ok: true });
});
