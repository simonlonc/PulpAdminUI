import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import type { PulpRepository } from "@/services/pulp/types";
import { extractNextApiPath, PulpPaginatedJson } from "./_server";

type RepositoryRow = Pick<PulpRepository, "pulp_href" | "name" | "latest_version_href">;

/** Repositories of every plugin kind in one list (Pulp's generic /repositories/), following `next`
 * to the end so neither Pulp's page size nor a fixed limit caps it. The kind of each row is only in
 * its `pulp_href`, so callers map it back through the plugin registry. */
export const GET = withPulpAuth(async (_request, auth) => {
  const results: RepositoryRow[] = [];
  let nextPath: string | null =
    "/repositories/?fields=pulp_href,name,latest_version_href&limit=1000";

  while (nextPath) {
    const result = await pulpFetch<PulpPaginatedJson<RepositoryRow>>(nextPath, auth);
    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }
    results.push(...result.data.results);
    nextPath = extractNextApiPath(result.data.next);
  }

  return Response.json({ count: results.length, next: null, previous: null, results });
});
