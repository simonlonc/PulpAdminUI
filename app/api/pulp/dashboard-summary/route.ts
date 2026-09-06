import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE } from "@/lib/pulp";
import { getCachedPulpDashboardStats } from "@/lib/pulp-dashboard-stats";
import { requirePulpAuth } from "../_helpers";

export async function GET() {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const cookieStore = await cookies();

  const stats = await getCachedPulpDashboardStats(authResult.auth);

  if (!stats.ok) {
    if (stats.status === 401 || stats.status === 403) {
      cookieStore.delete(PULP_AUTH_COOKIE);
    }

    return Response.json(
      { detail: stats.detail },
      { status: stats.status && stats.status >= 400 ? stats.status : 502 }
    );
  }

  return Response.json(stats, {
    headers: {
      "Cache-Control": "private, max-age=30",
    },
  });
}
