import { cookies } from "next/headers";
import { getPulpBaseUrl, PULP_AUTH_COOKIE, pulpFetch, type PulpAuth } from "@/lib/pulp";
import { requirePulpAuth } from "@/app/api/pulp/_helpers";
import { hrefFromCreatedResource, waitForTask } from "@/app/api/pulp/repositories/_server";

type CreateRpmRequestBody = {
  artifact?: string;
};

type CreateRpmResponse = {
  task?: string;
  pulp_href?: string;
  href?: string;
};

type ExistingRpmPackage = {
  pulp_href?: string;
  href?: string;
  sha256?: string;
  pkgId?: string;
};

type ExistingRpmPackageResponse = {
  results?: ExistingRpmPackage[];
};

type DuplicatePackageInfo = {
  pkgId?: string;
  name?: string;
  version?: string;
  release?: string;
  arch?: string;
};

function toAbsoluteArtifactUrl(artifact: string): string {
  if (artifact.startsWith("http://") || artifact.startsWith("https://")) {
    return artifact;
  }

  const origin = new URL(getPulpBaseUrl()).origin;
  const normalized = artifact.startsWith("/") ? artifact : `/${artifact}`;
  return `${origin}${normalized}`;
}

function parseDuplicatePackageInfo(errorText: string): DuplicatePackageInfo | null {
  if (!errorText.includes("already a package with")) {
    return null;
  }

  const pkgId = errorText.match(/pkgId=([a-f0-9]{64})/i)?.[1];
  const name = errorText.match(/name=([^,]+)/)?.[1]?.trim();
  const version = errorText.match(/version=([^,]+)/)?.[1]?.trim();
  const release = errorText.match(/release=([^,]+)/)?.[1]?.trim();
  const arch = errorText.match(/arch=([^,]+)/)?.[1]?.trim();

  if (!pkgId && !name) {
    return null;
  }

  return { pkgId, name, version, release, arch };
}

async function findExistingRpmContent(
  auth: PulpAuth,
  info: DuplicatePackageInfo
): Promise<string | null> {
  async function fetchFirst(query: string): Promise<string | null> {
    const result = await pulpFetch<ExistingRpmPackageResponse>(`/content/rpm/packages/?${query}`, auth);
    if (!result.ok) {
      return null;
    }

    const first = result.data.results?.[0];
    return first?.pulp_href ?? first?.href ?? null;
  }

  if (info.pkgId) {
    const bySha = await fetchFirst(`sha256=${encodeURIComponent(info.pkgId)}`);
    if (bySha) return bySha;
  }

  const queryParams: string[] = [];
  if (info.name) queryParams.push(`name=${encodeURIComponent(info.name)}`);
  if (info.version) queryParams.push(`version=${encodeURIComponent(info.version)}`);
  if (info.release) queryParams.push(`release=${encodeURIComponent(info.release)}`);
  if (info.arch) queryParams.push(`arch=${encodeURIComponent(info.arch)}`);

  if (queryParams.length === 0) {
    return null;
  }

  return fetchFirst(queryParams.join("&"));
}

export async function POST(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const body = (await request.json()) as CreateRpmRequestBody;
  const artifact = body.artifact?.trim();
  if (!artifact) {
    return Response.json({ detail: "Artifact is required." }, { status: 400 });
  }

  const createResult = await pulpFetch<CreateRpmResponse>("/content/rpm/packages/", authResult.auth, {
    method: "POST",
    body: JSON.stringify({ artifact: toAbsoluteArtifactUrl(artifact) }),
  });

  if (!createResult.ok) {
    if (createResult.status === 401 || createResult.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }

    return Response.json({ detail: createResult.detail }, { status: createResult.status });
  }

  const created = createResult.data;
  let content = created.pulp_href ?? created.href ?? null;

  if (created.task) {
    try {
      const task = await waitForTask(created.task, authResult.auth);
      content = hrefFromCreatedResource(task.created_resources?.[0]) ?? task.pulp_href ?? task.href ?? content;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const duplicateInfo = parseDuplicatePackageInfo(errorMessage);

      if (!duplicateInfo) {
        throw error;
      }

      const existingContent = await findExistingRpmContent(authResult.auth, duplicateInfo);
      if (!existingContent) {
        throw error;
      }

      content = existingContent;
    }
  }

  return Response.json({
    content,
    task: created.task ?? null,
  });
}
