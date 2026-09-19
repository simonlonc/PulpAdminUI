import { applyContentOrigin } from "@/lib/content-origin";
import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../../_helpers";

type PulpDistribution = {
  pulp_href: string;
  pulp_created: string;
  base_path: string;
  base_url: string;
  content_guard: string | null;
  pulp_labels: Record<string, string>;
  name: string;
  repository: string | null;
  publication?: string | null;
};

type UpdatePulpDistributionPayload = {
  name?: string;
  base_path?: string;
  repository?: string | null;
  publication?: string | null;
  content_guard?: string | null;
};

function resolveDistributionPath(encodedRef: string): string | null {
  const decodedRef = decodeURIComponent(encodedRef).trim();
  if (decodedRef.length === 0) {
    return null;
  }

  let pathname = decodedRef;
  if (/^https?:\/\//i.test(decodedRef)) {
    try {
      pathname = new URL(decodedRef).pathname;
    } catch {
      return null;
    }
  }

  if (!pathname.startsWith("/")) {
    return null;
  }

  const distributionsIndex = pathname.indexOf("/distributions/");
  if (distributionsIndex === -1) {
    return null;
  }

  const normalizedPath = pathname.slice(distributionsIndex);
  return normalizedPath.endsWith("/") ? normalizedPath : `${normalizedPath}/`;
}

export const GET = withPulpAuth(
  async (_request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const distributionPath = resolveDistributionPath(id);
    if (!distributionPath) {
      return Response.json({ detail: "Invalid distribution identifier." }, { status: 400 });
    }

    const result = await pulpFetch<PulpDistribution>(distributionPath, auth);

    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    return Response.json({ ...result.data, base_url: applyContentOrigin(result.data.base_url) });
  }
);

export const PATCH = withPulpAuth(
  async (request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const distributionPath = resolveDistributionPath(id);
    if (!distributionPath) {
      return Response.json({ detail: "Invalid distribution identifier." }, { status: 400 });
    }

    let payload: Partial<UpdatePulpDistributionPayload> | null = null;
    try {
      payload = (await request.json()) as Partial<UpdatePulpDistributionPayload>;
    } catch {
      return Response.json({ detail: "Invalid request body." }, { status: 400 });
    }

    const updatePayload: UpdatePulpDistributionPayload = {};
    if (typeof payload.name === "string") updatePayload.name = payload.name.trim();
    if (typeof payload.base_path === "string")
      updatePayload.base_path = payload.base_path.trim();
    if ("repository" in (payload ?? {})) {
      updatePayload.repository = payload.repository ?? null;
    }
    if ("publication" in (payload ?? {})) {
      updatePayload.publication = payload.publication ?? null;
    }
    if ("content_guard" in (payload ?? {})) {
      updatePayload.content_guard = payload.content_guard ?? null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return Response.json(
        { detail: "At least one distribution field must be provided." },
        { status: 400 }
      );
    }

    const result = await pulpFetch<PulpDistribution & { task?: string }>(
      distributionPath,
      auth,
      {
        method: "PATCH",
        body: JSON.stringify(updatePayload),
      }
    );

    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    // Dispatch-and-return: the task href goes back to the UI to poll, and the caller re-reads
    // the distribution itself.
    return Response.json({ ok: true, task: result.data.task ?? null });
  }
);

export const DELETE = withPulpAuth(
  async (_request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const distributionPath = resolveDistributionPath(id);
    if (!distributionPath) {
      return Response.json({ detail: "Invalid distribution identifier." }, { status: 400 });
    }

    const result = await pulpFetch<{ task?: string }>(distributionPath, auth, {
      method: "DELETE",
    });

    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    // Dispatch-and-return: the task href goes back to the UI to poll.
    return Response.json({ ok: true, task: result.data.task ?? null });
  }
);
