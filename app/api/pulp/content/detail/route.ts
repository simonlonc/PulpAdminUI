import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { findPulpPluginIn } from "@/lib/pulp-plugins";
import { getPulpPluginRegistry } from "@/lib/pulp-plugin-registry";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";

export async function GET(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind")?.trim();
  const id = url.searchParams.get("id")?.trim();
  if (!kind || !id) {
    return Response.json({ detail: "kind and id are required." }, { status: 400 });
  }

  const plugin = findPulpPluginIn(await getPulpPluginRegistry(authResult.auth), kind);
  if (!plugin) {
    return Response.json({ detail: "Unknown content kind." }, { status: 400 });
  }

  const result = await pulpFetch<Record<string, unknown>>(
    `${plugin.contentPath}${id}/`,
    authResult.auth
  );

  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }

    return Response.json({ detail: result.detail }, { status: result.status });
  }

  return Response.json(result.data);
}
