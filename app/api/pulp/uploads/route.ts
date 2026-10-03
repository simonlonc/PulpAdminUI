import { createHash } from "node:crypto";
import { getPulpApiUrl, pulpFetch, toBasicAuthHeader, type PulpAuth } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../_helpers";
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

export const POST = withPulpAuth(async (request, auth) => {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new PulpApiError(400, "Invalid multipart form data.");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new PulpApiError(400, "Missing file.");
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  if (fileBuffer.byteLength === 0) {
    throw new PulpApiError(400, "File must not be empty.");
  }

  const sha256 = createHash("sha256").update(fileBuffer).digest("hex");
  // The per-chunk PUT below sends multipart FormData (Content-Range header, no JSON body), which
  // pulpFetch cannot express (it always assumes/serializes a JSON request body), so that one call
  // stays on raw fetch with the shared authHeaders()/readDetail() helpers; every other call in
  // this route is plain JSON and goes through pulpFetch.
  const authHeader = toBasicAuthHeader(auth);

  const createUploadResult = await pulpFetch<CreateUploadResponse>("/uploads/", auth, {
    method: "POST",
    body: JSON.stringify({ size: fileBuffer.byteLength }),
  });

  if (!createUploadResult.ok) {
    throw new PulpApiError(createUploadResult.status, createUploadResult.detail);
  }

  const created = createUploadResult.data;
  const uploadHref = created.pulp_href ?? created.href;
  if (!uploadHref) {
    throw new PulpApiError(502, "Upload creation failed.");
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
      throw new PulpApiError(uploadChunkResponse.status, await readDetail(uploadChunkResponse));
    }
  }

  const commitUploadResult = await pulpFetch<CommitUploadResponse>(
    normalizePulpHrefToApiPath(`${uploadHref}commit/`),
    auth,
    {
      method: "POST",
      body: JSON.stringify({ sha256 }),
    }
  );

  if (!commitUploadResult.ok) {
    throw new PulpApiError(commitUploadResult.status, commitUploadResult.detail);
  }

  const committed = commitUploadResult.data;
  let artifact: string | null = committed.artifact ?? committed.pulp_href ?? committed.href ?? null;

  if (committed.task) {
    try {
      const task = await waitForTask(committed.task, auth);
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

      const existingArtifact = await findArtifactBySha256(auth, duplicateSha256);
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
});
