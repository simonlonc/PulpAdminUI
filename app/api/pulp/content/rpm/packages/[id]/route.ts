import { pulpFetch } from "@/lib/pulp";
import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";

type PulpRpmPackage = Record<string, unknown>;

function getPackagePath(id: string): string {
  return `/content/rpm/packages/${id}/`;
}

export const GET = withPulpAuth(
  async (_request: Request, auth, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    if (!id) {
      return Response.json({ detail: "Package id is required." }, { status: 400 });
    }

    const result = await pulpFetch<PulpRpmPackage>(getPackagePath(id), auth);
    if (!result.ok) {
      throw new PulpApiError(result.status, result.detail);
    }

    return Response.json(result.data);
  }
);
