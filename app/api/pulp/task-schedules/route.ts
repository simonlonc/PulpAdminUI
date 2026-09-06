import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../_helpers";
import { PulpPaginatedResponse, PulpTaskSchedule } from "@/services/pulp/types";

function parseOffset(value: string | null): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return n;
}

function parseLimit(value: string | null): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < 1) {
    return 100;
  }
  return Math.min(500, n);
}

export const GET = withPulpAuth(async (request, auth) => {
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const offset = parseOffset(url.searchParams.get("offset"));

  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  const result = await pulpFetch<PulpPaginatedResponse<PulpTaskSchedule>>(
    `/task-schedules/?${qs.toString()}`,
    auth
  );

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});
