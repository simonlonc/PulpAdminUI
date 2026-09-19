import { applyContentOrigin, getContentOriginOverride } from "@/lib/content-origin";
import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../_helpers";
import { PulpStatus } from "@/services/pulp/types";

export const GET = withPulpAuth(async (_request, auth) => {
  const result = await pulpFetch<PulpStatus>("/status/", auth);

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  const override = getContentOriginOverride();
  return Response.json({
    ...result.data,
    content_origin_effective: override
      ? (applyContentOrigin(result.data.content_settings?.content_origin ?? null) ?? override)
      : null,
  });
});
