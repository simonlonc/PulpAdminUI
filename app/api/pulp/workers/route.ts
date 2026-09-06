import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../_helpers";

type PulpWorker = {
  pulp_href: string;
  pulp_created: string;
  name: string;
  last_heartbeat: string;
  current_task: string | null;
};

type PulpListResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export const GET = withPulpAuth(async (_request, auth) => {
  const result = await pulpFetch<PulpListResponse<PulpWorker>>("/workers/", auth);
  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});
