import { cookies } from "next/headers";
import { PULP_AUTH_COOKIE, pulpLogout } from "@/lib/pulp";
import { requirePulpAuth } from "../_helpers";

export async function POST() {
  const cookieStore = await cookies();
  // Not ok means no valid cookie or no known server for it: nothing to end on the Pulp side.
  const authResult = await requirePulpAuth();
  if (authResult.ok && authResult.auth.pulpSession) {
    await pulpLogout(authResult.auth);
  }
  cookieStore.delete(PULP_AUTH_COOKIE);

  return Response.json({ ok: true });
}
