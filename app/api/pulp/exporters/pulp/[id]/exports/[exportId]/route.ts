import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import type { PulpExport } from "@/services/pulp/types";
import { resolvePulpExportPath } from "../../../_server";

// `exportId` is the export's full pulp_href, which already carries its exporter, so the [id]
// segment above it is not read here.
type ExportRouteContext = { params: Promise<{ id: string; exportId: string }> };

export const GET = withPulpAuth(async (_request: Request, auth, { params }: ExportRouteContext) => {
  const { exportId } = await params;
  const exportPath = resolvePulpExportPath(exportId);
  if (!exportPath) {
    return Response.json({ detail: "Invalid export identifier." }, { status: 400 });
  }

  const result = await pulpFetch<PulpExport>(exportPath, auth);

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});

/** Export delete is synchronous (204, no task href). */
export const DELETE = withPulpAuth(async (_request: Request, auth, { params }: ExportRouteContext) => {
  const { exportId } = await params;
  const exportPath = resolvePulpExportPath(exportId);
  if (!exportPath) {
    return Response.json({ detail: "Invalid export identifier." }, { status: 400 });
  }

  const result = await pulpFetch(exportPath, auth, {
    method: "DELETE",
  });

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json({ ok: true });
});
