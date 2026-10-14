import { listPulpBackends } from "@/lib/pulp-backends";

// Open to callers who are not logged in, so it names each server but never says where it is.
export async function GET() {
  try {
    const backends = await listPulpBackends();
    return Response.json(backends.map((backend) => ({ id: backend.id, label: backend.label })));
  } catch {
    // The store has already logged why, and its message names the file.
    return Response.json({ detail: "The Pulp server list cannot be read." }, { status: 500 });
  }
}
