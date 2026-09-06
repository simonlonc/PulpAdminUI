import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../_helpers";
import { PulpStatus } from "@/services/pulp/types";

export const GET = withPulpAuth(async (_request, auth) => {
  const result = await pulpFetch<PulpStatus>("/status/", auth);

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});
