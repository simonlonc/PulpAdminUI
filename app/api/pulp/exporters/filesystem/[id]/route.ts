import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, readJsonBody, withPulpAuth } from "@/app/api/pulp/_helpers";
import { isPulpFilesystemExportMethod } from "@/services/pulp/filesystem-export-methods";
import type {
  PulpFilesystemExporter,
  UpdatePulpFilesystemExporterPayload,
} from "@/services/pulp/types";
import { resolveFilesystemExporterPath } from "../_server";

export const GET = withPulpAuth(
  async (_request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const exporterPath = resolveFilesystemExporterPath(id);
    if (!exporterPath) {
      return Response.json({ detail: "Invalid exporter identifier." }, { status: 400 });
    }

    const result = await pulpFetch<PulpFilesystemExporter>(exporterPath, auth);

    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    return Response.json(result.data);
  }
);

export const PATCH = withPulpAuth(
  async (request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const exporterPath = resolveFilesystemExporterPath(id);
    if (!exporterPath) {
      return Response.json({ detail: "Invalid exporter identifier." }, { status: 400 });
    }

    const body = await readJsonBody(request);

    const updatePayload: UpdatePulpFilesystemExporterPayload = {};
    if (typeof body.name === "string") updatePayload.name = body.name.trim();
    if (typeof body.path === "string") updatePayload.path = body.path.trim();
    if ("method" in body) {
      if (!isPulpFilesystemExportMethod(body.method)) {
        return Response.json(
          { detail: "method must be one of write, hardlink or symlink." },
          { status: 400 }
        );
      }
      updatePayload.method = body.method;
    }

    if (Object.keys(updatePayload).length === 0) {
      return Response.json({ detail: "At least one exporter field must be provided." }, { status: 400 });
    }

    const result = await pulpFetch<{ task?: string }>(exporterPath, auth, {
      method: "PATCH",
      body: JSON.stringify(updatePayload),
    });

    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    // Dispatch-and-return: Pulp applies an exporter update in a task (202), so the task href goes
    // back to the UI to poll, and the caller re-reads the exporter itself.
    return Response.json({ task: result.data.task ?? null });
  }
);

export const DELETE = withPulpAuth(
  async (_request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const exporterPath = resolveFilesystemExporterPath(id);
    if (!exporterPath) {
      return Response.json({ detail: "Invalid exporter identifier." }, { status: 400 });
    }

    const result = await pulpFetch<{ task?: string }>(exporterPath, auth, {
      method: "DELETE",
    });

    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    // Dispatch-and-return: Pulp deletes an exporter in a task (202), so the task href goes back to
    // the UI to poll.
    return Response.json({ task: result.data.task ?? null });
  }
);
