/**
 * Fuzz properties for lib/log.ts redaction: whatever the secret looks like, it never reaches
 * the output line. The secrets are the three things the logger is told to keep out: a value
 * under a credential key, an Authorization-style `Basic`/`Bearer` value under an innocent
 * key, and an encoded PulpAuth cookie value under an innocent key.
 *
 * The oracle is the raw line written to stdout, checked for the secret as a substring, which
 * does not reimplement the redaction rule. A secret that already occurs in the line without
 * the secret in it (for example the word "level") is discarded with fc.pre, since its
 * presence would prove nothing.
 */

import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logError } from "@/lib/log";
import { encodePulpAuth } from "@/lib/pulp";

let lines: string[] = [];

beforeEach(() => {
  lines = [];
  vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const credentialKey = fc.constantFrom(
  "password",
  "Password",
  "secret",
  "authorization",
  "Authorization",
  "cookie",
  "pulp_auth",
  "token",
  "session_secret"
);
const innocentKey = fc.constantFrom("detail", "path", "stack", "note", "header");
const secret = fc.string({ unit: "grapheme", minLength: 8 });
// RFC 7235 credentials are one run of non-whitespace: base64 for Basic, token68 for Bearer.
const credential = fc.string({ unit: "grapheme", minLength: 8 }).filter((s) => /^\S+$/.test(s));
const nonEmptyUnicodeString = fc.string({ unit: "grapheme", minLength: 1 });

// The line the call produces with nothing secret in it, to discard secrets that occur in the
// fixed parts of every line.
function lineWith(key: string, value: string): string {
  lines = [];
  logError("e", { [key]: value });

  return lines[0];
}

describe("log redaction", () => {
  it("never writes a string under a credential key", () => {
    fc.assert(
      fc.property(credentialKey, secret, (key, value) => {
        fc.pre(!lineWith(key, "").includes(value));

        expect(lineWith(key, value)).not.toContain(JSON.stringify(value).slice(1, -1));
      })
    );
  });

  it("never writes a Basic or Bearer credential under an innocent key", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("Basic", "Bearer", "basic", "BEARER"),
        credential,
        innocentKey,
        fc.string({ maxLength: 20 }),
        (scheme, value, key, prefix) => {
          fc.pre(!lineWith(key, `${prefix} ${scheme} `).includes(value));

          expect(lineWith(key, `${prefix} ${scheme} ${value}`)).not.toContain(
            JSON.stringify(value).slice(1, -1)
          );
        }
      )
    );
  });

  it("never writes an encoded PulpAuth cookie value under an innocent key", () => {
    fc.assert(
      fc.property(
        fc.record({ username: nonEmptyUnicodeString, password: nonEmptyUnicodeString }),
        innocentKey,
        (auth, key) => {
          const value = encodePulpAuth(auth);

          expect(lineWith(key, `got ${value} here`)).not.toContain(value);
        }
      )
    );
  });
});
