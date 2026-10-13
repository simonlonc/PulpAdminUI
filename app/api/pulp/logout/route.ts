import { cookies } from "next/headers";
import { decodePulpAuth, PULP_AUTH_COOKIE, pulpLogout } from "@/lib/pulp";

export async function POST() {
  const cookieStore = await cookies();
  const encoded = cookieStore.get(PULP_AUTH_COOKIE)?.value;
  const auth = encoded ? decodePulpAuth(encoded) : null;
  if (auth?.pulpSession) {
    await pulpLogout(auth);
  }
  cookieStore.delete(PULP_AUTH_COOKIE);

  return Response.json({ ok: true });
}
