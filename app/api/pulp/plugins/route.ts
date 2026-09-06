import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { withPulpAuth } from "@/app/api/pulp/_helpers";

export const GET = withPulpAuth(async (_request, auth) => {
  return Response.json(await getPulpPluginRegistry(auth));
});
