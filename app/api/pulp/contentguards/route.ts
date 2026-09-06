import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../_helpers";
import { findPulpContentGuardKind } from "@/services/pulp/content-guard-kinds";
import { buildUpstreamListParams, toPulpHrefPath } from "../repositories/_server";

/** Row from GET /contentguards/, the generic cross-type content-guard list. Also used for the
 * distribution edit/create modals' guard picker. */
type PulpContentGuard = {
  pulp_href: string;
  prn: string;
  pulp_created: string;
  pulp_last_updated: string;
  name: string;
  description: string | null;
};

type PulpListResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export const GET = withPulpAuth(async (request, auth) => {
  const url = new URL(request.url);
  const qs = buildUpstreamListParams(url.searchParams, ["pulp_type"]);
  // Content guards have no labels, and Pulp 400s on this filter for them.
  qs.delete("pulp_label_select");

  const result = await pulpFetch<PulpListResponse<PulpContentGuard>>(
    `/contentguards/?${qs.toString()}`,
    auth
  );
  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});

type CreateBody = {
  kind?: string;
  name?: string;
  description?: string | null;
  header_name?: string;
  header_value?: string;
  jq_filter?: string | null;
  ca_certificate?: string;
  guards?: string[];
};

/** Content-guard create: dispatches on `kind` to the matching typed upstream path. Unlike
 * distributions, every contentguards endpoint is synchronous (201, no task href). */
export const POST = withPulpAuth(async (request, auth) => {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ detail: "Invalid request body." }, { status: 400 });
  }

  const descriptor = findPulpContentGuardKind(body.kind ?? "");
  if (!descriptor) {
    return Response.json({ detail: `Unknown content guard kind: ${body.kind}` }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return Response.json({ detail: "Content guard name is required." }, { status: 400 });
  }

  const createPayload: Record<string, unknown> = { name };
  if (body.description !== undefined) {
    createPayload.description = body.description;
  }

  if (descriptor.kind === "core.header") {
    const headerName = body.header_name?.trim();
    const headerValue = body.header_value;
    if (!headerName || !headerValue) {
      return Response.json(
        { detail: "header_name and header_value are required." },
        { status: 400 }
      );
    }
    createPayload.header_name = headerName;
    createPayload.header_value = headerValue;
    if (body.jq_filter !== undefined) {
      createPayload.jq_filter = body.jq_filter;
    }
  } else if (descriptor.kind === "certguard.x509" || descriptor.kind === "certguard.rhsm") {
    if (!body.ca_certificate) {
      return Response.json({ detail: "ca_certificate is required." }, { status: 400 });
    }
    createPayload.ca_certificate = body.ca_certificate;
  } else if (descriptor.kind === "core.composite" && body.guards !== undefined) {
    createPayload.guards = body.guards.map((guard) => toPulpHrefPath(guard));
  }

  const result = await pulpFetch<PulpContentGuard>(`/contentguards/${descriptor.path}/`, auth, {
    method: "POST",
    body: JSON.stringify(createPayload),
  });

  if (!result.ok) {
    throw new PulpApiError(result.status, result.detail);
  }

  return Response.json(result.data);
});
