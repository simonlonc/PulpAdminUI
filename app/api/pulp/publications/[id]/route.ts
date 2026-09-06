import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "../../_helpers";

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

export const DELETE = withPulpAuth(
  async (_request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const publicationPath = resolvePublicationPath(id);
    if (!publicationPath) {
      return Response.json({ detail: "Invalid publication identifier." }, { status: 400 });
    }

    const result = await pulpFetch(publicationPath, auth, {
      method: "DELETE",
    });

    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    return Response.json({ ok: true });
  }
);
