import { pulpFetch } from "@/lib/pulp";
import { findPulpPluginIn } from "@/lib/pulp-plugins";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";

export const GET = withPulpAuth(async (request, auth) => {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind")?.trim();
  const id = url.searchParams.get("id")?.trim();
  if (!kind || !id) {
    return Response.json({ detail: "kind and id are required." }, { status: 400 });
  }

  const plugin = findPulpPluginIn(await getPulpPluginRegistry(auth), kind);
  if (!plugin) {
    return Response.json({ detail: "Unknown content kind." }, { status: 400 });
  }

  // path names which of the family's endpoints the unit lives on; anything unrecognised falls
  // back to the first, the one the descriptor treats as the family's default.
  const requestedPath = url.searchParams.get("path")?.trim();
  const endpoint =
    plugin.contentEndpoints.find((e) => e.path === requestedPath) ?? plugin.contentEndpoints[0];
  if (!endpoint) {
    return Response.json({ detail: "This plugin has no content endpoint." }, { status: 400 });
  }

  const result = await pulpFetch<Record<string, unknown>>(
    `${endpoint.path}${id}/`,
    auth
  );

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});
