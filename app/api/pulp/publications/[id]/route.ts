import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpFetch } from "@/lib/pulp";
import { requirePulpAuth } from "../../_helpers";

function resolvePublicationPath(encodedRef: string): string | null {
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

  const publicationsIndex = pathname.indexOf("/publications/");
  if (publicationsIndex === -1) {
    return null;
  }

  const normalizedPath = pathname.slice(publicationsIndex);
  return normalizedPath.endsWith("/") ? normalizedPath : `${normalizedPath}/`;
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requirePulpAuth();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { id } = await params;
  const publicationPath = resolvePublicationPath(id);
  if (!publicationPath) {
    return Response.json({ detail: "Invalid publication identifier." }, { status: 400 });
  }

  const result = await pulpFetch(publicationPath, authResult.auth, {
    method: "DELETE",
  });

  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      const cookieStore = await cookies();
      cookieStore.delete(PULP_AUTH_COOKIE);
    }

    return Response.json({ detail: result.detail }, { status: result.status });
  }

  return Response.json({ ok: true });
}
