import { addPulpBackend, checkPulpBackendBaseUrl, listPulpBackends } from "@/lib/pulp-backends";
import { readJsonBody, requirePulpSuperuser, withPulpAuth } from "../../_helpers";
import { guardBackendStore, probePulpBackend } from "./_server";

export const GET = withPulpAuth(async (_request, auth) => {
  await requirePulpSuperuser(auth);

  return Response.json(await guardBackendStore(listPulpBackends));
});

export const POST = withPulpAuth(async (request, auth) => {
  await requirePulpSuperuser(auth);
  const body = await readJsonBody(request);

  const baseUrl = checkPulpBackendBaseUrl(body.baseUrl);
  if (!baseUrl.ok) {
    return Response.json({ detail: baseUrl.detail }, { status: 400 });
  }
  await probePulpBackend(baseUrl.value);

  const added = await guardBackendStore(() =>
    addPulpBackend({ label: body.label, baseUrl: baseUrl.value })
  );
  if (!added.ok) {
    return Response.json({ detail: added.detail }, { status: added.status });
  }

  return Response.json(added.backend, { status: 201 });
});
