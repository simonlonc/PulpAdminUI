// Server-only (enforced by the no-client-log-import rule in eslint.config.mjs). One JSON line
// per event on stdout, which is what the container platform collects.
//
// Redaction is applied to every field before it is written, and it is the reason the fields
// are a flat record of primitives: an object such as a PulpAuth or a headers map cannot be
// passed without a type error. Two rules, both deliberately blunt (over-redacting is cheap,
// leaking is not):
//   1. A string or number under a key that names a credential is replaced outright. Booleans
//      and null pass, so `session_secret_set: true` still reads.
//   2. Every string value is scrubbed for credential shapes whatever its key: `Basic`/`Bearer`
//      credentials, a `pulp_auth=` cookie pair, userinfo in a URL, and any run of base64url
//      characters at least as long as the shortest value encodePulpAuth can produce (an
//      encoded PulpAuth cookie value, found without needing the session secret).

type LogLevel = "error" | "warn" | "info";
type LogValue = string | number | boolean | null | undefined;
type LogFields = Record<string, LogValue>;

const LEVEL_RANK: Record<LogLevel, number> = { error: 0, warn: 1, info: 2 };
const REDACTED = "[redacted]";

const SENSITIVE_KEY = /pass|secret|auth|cookie|token|credential/i;
const VALUE_SCRUBS: [RegExp, string][] = [
  [/\b(basic|bearer)\s+\S+/gi, `$1 ${REDACTED}`],
  [/pulp_auth=[^;\s]*/gi, `pulp_auth=${REDACTED}`],
  [/(:\/\/)[^/\s@]*@/g, `$1${REDACTED}@`],
  // 12-byte IV + 16-byte tag + the 29-byte JSON of an empty PulpAuth = 57 bytes = 76 base64url chars.
  [/[A-Za-z0-9_-]{76,}/g, REDACTED],
];

/** The level from LOG_LEVEL, read at call time. Anything but error, warn or info is info. */
export function resolveLogLevel(): LogLevel {
  const value = process.env.LOG_LEVEL?.trim().toLowerCase();

  return value === "error" || value === "warn" || value === "info" ? value : "info";
}

function redact(key: string, value: LogValue): LogValue {
  if (typeof value === "boolean" || value === null || value === undefined) {
    return value;
  }

  if (SENSITIVE_KEY.test(key)) {
    return REDACTED;
  }

  return typeof value === "string"
    ? VALUE_SCRUBS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value)
    : value;
}

function write(level: LogLevel, event: string, fields: LogFields) {
  if (LEVEL_RANK[level] > LEVEL_RANK[resolveLogLevel()]) {
    return;
  }

  const line: LogFields = { level, event };

  for (const [key, value] of Object.entries(fields)) {
    if (key !== "level" && key !== "event") {
      line[key] = redact(key, value);
    }
  }

  process.stdout.write(`${JSON.stringify(line)}\n`);
}

export function logError(event: string, fields: LogFields = {}) {
  write("error", event, fields);
}

export function logWarn(event: string, fields: LogFields = {}) {
  write("warn", event, fields);
}

export function logInfo(event: string, fields: LogFields = {}) {
  write("info", event, fields);
}
