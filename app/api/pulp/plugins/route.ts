import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";

export async function GET() {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  return Response.json(await getPulpPluginRegistry(authResult.auth));
}
