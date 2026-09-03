import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { requirePulpAuth } from "../_helpers";
import { normalizePulpHrefToApiPath } from "../repositories/_server";
import { PulpPaginatedResponse, PulpTask } from "@/services/pulp/types";

function parseOffset(value: string | null): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return n;
}

function parseLimit(value: string | null): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < 1) {
    return 100;
  }
  return Math.min(500, n);
}

export async function GET(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const offset = parseOffset(url.searchParams.get("offset"));

  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  const result = await pulpFetch<PulpPaginatedResponse<PulpTask>>(
    `/tasks/?${qs.toString()}`,
    authResult.auth
  );

  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }

    return Response.json({ detail: result.detail }, { status: result.status });
  }

  return Response.json(result.data);
}

type CancelBody = {
  pulp_href?: string;
};

function isTaskApiPath(path: string): boolean {
  return path.includes("/tasks/");
}

export async function PATCH(request: Request) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const body = (await request.json()) as CancelBody;
  const pulpHref = body.pulp_href?.trim();
  if (!pulpHref) {
    return Response.json({ detail: "pulp_href is required." }, { status: 400 });
  }

  const apiPath = normalizePulpHrefToApiPath(pulpHref);
  if (!isTaskApiPath(apiPath)) {
    return Response.json({ detail: "Not a task href." }, { status: 400 });
  }

  // PatchedTaskCancel only accepts "canceled"; Pulp answers 409 for tasks that already finished.
  const result = await pulpFetch<PulpTask>(apiPath, authResult.auth, {
    method: "PATCH",
    body: JSON.stringify({ state: "canceled" }),
  });

  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }

    // On 409 Pulp returns the task itself, not an error body, so build a readable message.
    if (result.status === 409) {
      return Response.json(
        { detail: "Task is no longer running and cannot be canceled." },
        { status: 409 }
      );
    }

    return Response.json({ detail: result.detail }, { status: result.status });
  }

  return Response.json(result.data);
}
