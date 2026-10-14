import {
  checkPulpBackendBaseUrl,
  DEFAULT_PULP_BACKEND_ID,
  getPulpBackend,
  removePulpBackend,
  updatePulpBackend,
} from "@/lib/pulp-backends";
import { readJsonBody, requirePulpSuperuser, withPulpAuth } from "../../../_helpers";
import { guardBackendStore, probePulpBackend } from "../_server";

export const PATCH = withPulpAuth(
  async (request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    await requirePulpSuperuser(auth);
    const { id } = await params;
    const body = await readJsonBody(request);

    let baseUrl: string | undefined;
    if (body.baseUrl !== undefined) {
      const checked = checkPulpBackendBaseUrl(body.baseUrl);
      if (!checked.ok) {
        return Response.json({ detail: checked.detail }, { status: 400 });
      }
      baseUrl = checked.value;

      // Only an address that differs from the saved one needs to answer: the edit form sends both
      // fields, and renaming a server that is down for a while must still work.
      const current = await guardBackendStore(() => getPulpBackend(id));
      if (!current) {
        return Response.json({ detail: "Pulp server not found." }, { status: 404 });
      }
      if (baseUrl !== current.baseUrl) {
        await probePulpBackend(baseUrl);
      }
    }

    const updated = await guardBackendStore(() => updatePulpBackend(id, { label: body.label, baseUrl }));
    if (!updated.ok) {
      return Response.json({ detail: updated.detail }, { status: updated.status });
    }

    return Response.json(updated.backend);
  }
);

export const DELETE = withPulpAuth(
  async (_request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    await requirePulpSuperuser(auth);
    const { id } = await params;

    // Removing the server this session is signed in to would end it on the next request.
    if ((auth.backendId ?? DEFAULT_PULP_BACKEND_ID) === id) {
      return Response.json(
        { detail: "You cannot remove the Pulp server you are signed in to." },
        { status: 400 }
      );
    }

    if (!(await guardBackendStore(() => removePulpBackend(id)))) {
      return Response.json({ detail: "Pulp server not found." }, { status: 404 });
    }

    return Response.json({ ok: true });
  }
);
