const FALLBACK = "/dashboard";

// `next=` must stay on this site. The decoded check catches `/%5C...` and `/%2F%2F...`, which
// the router decodes into a protocol-relative URL after the origin check has passed.
export function safeNextPath(value: string | null | undefined): string {
  if (!value) return FALLBACK;
  try {
    const decoded = decodeURIComponent(value);
    for (const candidate of [value, decoded]) {
      if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/\\")) {
        return FALLBACK;
      }
    }
    if (new URL(value, "http://x").origin !== "http://x") return FALLBACK;
  } catch {
    return FALLBACK;
  }
  return value;
}
