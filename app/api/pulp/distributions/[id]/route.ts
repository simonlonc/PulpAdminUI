import { applyContentOrigin } from "@/lib/content-origin";
import { pulpFetch } from "@/lib/pulp";
import { isRepositoryVersionHref } from "@/lib/pulp-resource-ref";
import { decodeRefOrNull, PulpApiError, readJsonBody, withPulpAuth } from "../../_helpers";

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
  repository_version?: string | null;
  hidden?: boolean;
};

type UpdatePulpDistributionPayload = {
  name?: string;
  base_path?: string;
  repository?: string | null;
  publication?: string | null;
  repository_version?: string | null;
  content_guard?: string | null;
  hidden?: boolean;
};

function resolveDistributionPath(encodedRef: string): string | null {
  const decodedRef = decodeRefOrNull(encodedRef);
  if (decodedRef === null) {
    return null;
  }
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

    const payload = (await readJsonBody(request)) as Partial<UpdatePulpDistributionPayload>;

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
    if ("repository_version" in (payload ?? {})) {
      const version = payload.repository_version ?? null;
      if (version !== null && (typeof version !== "string" || !isRepositoryVersionHref(version))) {
        return Response.json(
          { detail: "repository_version must be a repository version href." },
          { status: 400 }
        );
      }
      if (version !== null && (updatePayload.repository || updatePayload.publication)) {
        return Response.json(
          { detail: "Only one of repository, publication and repository_version may be set." },
          { status: 400 }
        );
      }
      updatePayload.repository_version = version;
    }
    if ("content_guard" in (payload ?? {})) {
      updatePayload.content_guard = payload.content_guard ?? null;
    }

    if ("hidden" in (payload ?? {})) {
      if (typeof payload.hidden !== "boolean") {
        return Response.json({ detail: "hidden must be true or false." }, { status: 400 });
      }
      updatePayload.hidden = payload.hidden;
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
