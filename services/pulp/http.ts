import { pulpErrorDetailFromBody } from "@/lib/pulp";

export const SESSION_LOST_EVENT = "pulp:session-lost";

export async function readApiDetail(
  response: Response,
  options: { signalSessionLost?: boolean } = {}
): Promise<string> {
  if (
    response.status === 401 &&
    options.signalSessionLost !== false &&
    typeof window !== "undefined"
  ) {
    window.dispatchEvent(new Event(SESSION_LOST_EVENT));
  }

  try {
    const body = (await response.json()) as unknown;
    const formatted = pulpErrorDetailFromBody(body);
    if (formatted) {
      return formatted;
    }
  } catch {
    // Ignore parsing failure and fallback to status text.
  }

  return response.statusText || "Unexpected server error.";
}
