import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { getPulpApiUrl, PULP_AUTH_COOKIE, pulpFetch, toBasicAuthHeader, type PulpAuth } from "@/lib/pulp";
import { requirePulpAuth } from "../_helpers";
import { authHeaders, normalizePulpHrefToApiPath, readDetail } from "../repositories/_server";

const CHUNK_SIZE = 8 * 1024 * 1024;

type CreateUploadResponse = {
  pulp_href: string;
  href?: string;
};

type CommitUploadResponse = {
  task?: string;
  artifact?: string;
  pulp_href?: string;
  href?: string;
};

// Distinct from the shared TaskResponse in _server.ts: this route needs the task's own
// `artifact` field (only DRF's chunked upload commit task exposes it directly), and its
// created_resources are always plain hrefs here rather than the {pulp_href} object shape.
type TaskResponse = {
  state?: string;
  error?: unknown;
  created_resources?: string[];
  pulp_href?: string;
  artifact?: string;
};

type PulpArtifactItem = {
  pulp_href?: string;
  href?: string;
};

type PulpArtifactListResponse = {
  results?: PulpArtifactItem[];
};

function extractSha256FromDuplicateError(errorText: string): string | null {
  const match = errorText.match(/sha256 checksum of ['"]([a-f0-9]{64})['"]/i);
  return match?.[1] ?? null;
}

async function findArtifactBySha256(auth: PulpAuth, sha256: string): Promise<string | null> {
  const result = await pulpFetch<PulpArtifactListResponse>(
    `/artifacts/?sha256=${encodeURIComponent(sha256)}`,
    auth
  );

  if (!result.ok) {
    return null;
  }

  const first = result.data.results?.[0];
  return first?.pulp_href ?? first?.href ?? null;
}

async function waitForTask(taskHref: string, auth: PulpAuth): Promise<TaskResponse> {
  const maxAttempts = 60;
  const taskPath = normalizePulpHrefToApiPath(taskHref);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await pulpFetch<TaskResponse>(taskPath, auth);
    if (!result.ok) {
      throw new Error(result.detail);
    }

    const task = result.data;
    if (task.state === "completed") {
      return task;
    }

    if (task.state === "failed" || task.state === "canceled") {
      const serializedError =
        typeof task.error === "string" ? task.error : JSON.stringify(task.error ?? "Task failed");
      throw new Error(serializedError);
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error("Task did not complete within timeout period.");
}

export async function POST(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ detail: "Missing file." }, { status: 400 });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  if (fileBuffer.byteLength === 0) {
    return Response.json({ detail: "File must not be empty." }, { status: 400 });
  }

  const sha256 = createHash("sha256").update(fileBuffer).digest("hex");
  // The per-chunk PUT below sends multipart FormData (Content-Range header, no JSON body), which
  // pulpFetch cannot express (it always assumes/serializes a JSON request body), so that one call
  // stays on raw fetch with the shared authHeaders()/readDetail() helpers; every other call in
  // this route is plain JSON and goes through pulpFetch.
  const authHeader = toBasicAuthHeader(authResult.auth);

  const createUploadResult = await pulpFetch<CreateUploadResponse>("/uploads/", authResult.auth, {
    method: "POST",
    body: JSON.stringify({ size: fileBuffer.byteLength }),
  });

  if (!createUploadResult.ok) {
    if (createUploadResult.status === 401 || createUploadResult.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }

    return Response.json({ detail: createUploadResult.detail }, { status: createUploadResult.status });
  }

  const created = createUploadResult.data;
  const uploadHref = created.pulp_href ?? created.href;
  if (!uploadHref) {
    return Response.json({ detail: "Upload creation failed." }, { status: 502 });
  }

  for (let start = 0; start < fileBuffer.byteLength; start += CHUNK_SIZE) {
    const end = Math.min(fileBuffer.byteLength - 1, start + CHUNK_SIZE - 1);
    const chunk = fileBuffer.subarray(start, end + 1);
    const uploadChunkHeaders = authHeaders(authHeader);
    uploadChunkHeaders.set("Content-Range", `bytes ${start}-${end}/*`);

    const chunkUrl = getPulpApiUrl(normalizePulpHrefToApiPath(uploadHref));
    const chunkForm = new FormData();
    const chunkBlob = new Blob([chunk], { type: "application/octet-stream" });
    chunkForm.set("file", chunkBlob, "chunk");

    const uploadChunkResponse = await fetch(chunkUrl, {
      method: "PUT",
      headers: uploadChunkHeaders,
      body: chunkForm,
      cache: "no-store",
    });

    if (!uploadChunkResponse.ok) {
      if (uploadChunkResponse.status === 401 || uploadChunkResponse.status === 403) {
        const cookieStore = await cookies();
        cookieStore.delete(PULP_AUTH_COOKIE);
      }

      return Response.json({ detail: await readDetail(uploadChunkResponse) }, { status: uploadChunkResponse.status });
    }
  }

  const commitUploadResult = await pulpFetch<CommitUploadResponse>(
    normalizePulpHrefToApiPath(`${uploadHref}commit/`),
    authResult.auth,
    {
      method: "POST",
      body: JSON.stringify({ sha256 }),
    }
  );

  if (!commitUploadResult.ok) {
    if (commitUploadResult.status === 401 || commitUploadResult.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }

    return Response.json({ detail: commitUploadResult.detail }, { status: commitUploadResult.status });
  }

  const committed = commitUploadResult.data;
  let artifact: string | null = committed.artifact ?? committed.pulp_href ?? committed.href ?? null;

  if (committed.task) {
    try {
      const task = await waitForTask(committed.task, authResult.auth);
      artifact =
        task.created_resources?.[0] ??
        task.artifact ??
        task.pulp_href ??
        artifact;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const duplicateSha256 = extractSha256FromDuplicateError(message);

      if (!duplicateSha256) {
        throw error;
      }

      const existingArtifact = await findArtifactBySha256(authResult.auth, duplicateSha256);
      if (!existingArtifact) {
        throw error;
      }

      artifact = existingArtifact;
    }
  }

  return Response.json({
    filename: file.name,
    size: fileBuffer.byteLength,
    sha256,
    upload: uploadHref,
    artifact,
    task: committed.task ?? null,
  });
}
