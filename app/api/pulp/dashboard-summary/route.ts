import { getCachedPulpDashboardStats } from "@/lib/pulp-dashboard-stats";
import { PulpApiError, withPulpAuth } from "../_helpers";

export const GET = withPulpAuth(async (_request, auth) => {
  const stats = await getCachedPulpDashboardStats(auth);

  if (!stats.ok) {
    throw new PulpApiError(stats.status && stats.status >= 400 ? stats.status : 502, stats.detail);
  }

  return Response.json(stats, {
    headers: {
      "Cache-Control": "private, max-age=30",
    },
  });
});
