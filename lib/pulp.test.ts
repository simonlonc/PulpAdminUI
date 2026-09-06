import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decodePulpAuth, encodePulpAuth, pulpErrorDetailFromBody, type PulpAuth } from "@/lib/pulp";

describe("pulpErrorDetailFromBody", () => {
  it("returns a trimmed string detail", () => {
    expect(pulpErrorDetailFromBody({ detail: "Not found." })).toBe("Not found.");
    expect(pulpErrorDetailFromBody({ detail: "  padded  " })).toBe("padded");
  });

  it("returns null for a blank string detail with nothing else to report", () => {
    expect(pulpErrorDetailFromBody({ detail: "" })).toBeNull();
    expect(pulpErrorDetailFromBody({ detail: "   " })).toBeNull();
  });

  it("joins an array detail into one string", () => {
    expect(pulpErrorDetailFromBody({ detail: ["Error one.", "Error two."] })).toBe(
      "Error one. Error two."
    );
  });

  it("stringifies non-string entries of an array detail", () => {
    expect(pulpErrorDetailFromBody({ detail: [{ code: "invalid" }] })).toBe('{"code":"invalid"}');
  });

  it("falls through to field parts for an empty array detail", () => {
    expect(pulpErrorDetailFromBody({ detail: [] })).toBeNull();
  });

  it("reports field-keyed errors", () => {
    expect(pulpErrorDetailFromBody({ name: ["This field is required."] })).toBe(
      "name: This field is required."
    );
    expect(pulpErrorDetailFromBody({ username: "already taken" })).toBe("username: already taken");
  });

  it("joins several field errors together", () => {
    expect(pulpErrorDetailFromBody({ name: ["required"], url: ["invalid"] })).toBe(
      "name: required url: invalid"
    );
  });

  it("puts non_field_errors first, ahead of any field errors", () => {
    expect(pulpErrorDetailFromBody({ non_field_errors: ["Unable to log in."] })).toBe(
      "Unable to log in."
    );
    expect(
      pulpErrorDetailFromBody({ non_field_errors: ["Bad credentials."], username: ["required"] })
    ).toBe("Bad credentials. username: required");
  });

  it("returns null for null, non-object and empty bodies", () => {
    expect(pulpErrorDetailFromBody(null)).toBeNull();
    expect(pulpErrorDetailFromBody(42)).toBeNull();
    expect(pulpErrorDetailFromBody("boom")).toBeNull();
    expect(pulpErrorDetailFromBody({})).toBeNull();
  });
});

describe("encodePulpAuth / decodePulpAuth", () => {
  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a username and password", () => {
    const auth: PulpAuth = { username: "admin", password: "p@ss w0rd!" };
    expect(decodePulpAuth(encodePulpAuth(auth))).toEqual(auth);
  });

  it("round-trips unicode characters", () => {
    const auth: PulpAuth = { username: "adminé", password: "пароль" };
    expect(decodePulpAuth(encodePulpAuth(auth))).toEqual(auth);
  });

  it("produces a different cookie value on each call (random IV)", () => {
    const auth: PulpAuth = { username: "admin", password: "p@ss w0rd!" };
    expect(encodePulpAuth(auth)).not.toBe(encodePulpAuth(auth));
  });

  it("does not leak the plaintext password into the cookie value", () => {
    const auth: PulpAuth = { username: "admin", password: "p@ss w0rd!" };
    const raw = Buffer.from(encodePulpAuth(auth), "base64url");
    expect(raw.toString("utf8")).not.toContain(auth.password);
    expect(raw.toString("latin1")).not.toContain(auth.password);
  });

  it("rejects a tampered ciphertext", () => {
    const auth: PulpAuth = { username: "admin", password: "p@ss w0rd!" };
    const raw = Buffer.from(encodePulpAuth(auth), "base64url");
    raw[raw.length - 1] ^= 0xff;
    expect(decodePulpAuth(raw.toString("base64url"))).toBeNull();
  });

  it("throws when PULP_SESSION_SECRET is unset, and decode returns null", () => {
    vi.unstubAllEnvs();
    const auth: PulpAuth = { username: "admin", password: "p@ss w0rd!" };
    expect(() => encodePulpAuth(auth)).toThrow("PULP_SESSION_SECRET is not set");
    expect(decodePulpAuth("anything")).toBeNull();
  });

  it("rejects an old-format or garbage cookie", () => {
    expect(decodePulpAuth("not valid base64url json!!!")).toBeNull();
  });

  it("rejects base64url of a string that is not JSON", () => {
    const encoded = Buffer.from("not json", "utf8").toString("base64url");
    expect(decodePulpAuth(encoded)).toBeNull();
  });

  it("rejects a payload missing username", () => {
    const encoded = Buffer.from(JSON.stringify({ password: "x" }), "utf8").toString("base64url");
    expect(decodePulpAuth(encoded)).toBeNull();
  });

  it("rejects a payload missing password", () => {
    const encoded = Buffer.from(JSON.stringify({ username: "admin" }), "utf8").toString("base64url");
    expect(decodePulpAuth(encoded)).toBeNull();
  });

  it("rejects an empty username or password", () => {
    const emptyUsername = Buffer.from(
      JSON.stringify({ username: "", password: "x" }),
      "utf8"
    ).toString("base64url");
    const emptyPassword = Buffer.from(
      JSON.stringify({ username: "admin", password: "" }),
      "utf8"
    ).toString("base64url");
    expect(decodePulpAuth(emptyUsername)).toBeNull();
    expect(decodePulpAuth(emptyPassword)).toBeNull();
  });

  it("rejects non-string username or password", () => {
    const encoded = Buffer.from(
      JSON.stringify({ username: "admin", password: 12345 }),
      "utf8"
    ).toString("base64url");
    expect(decodePulpAuth(encoded)).toBeNull();
  });

  it("rejects a JSON payload that is not an object", () => {
    const encoded = Buffer.from(JSON.stringify(["admin", "pass"]), "utf8").toString("base64url");
    expect(decodePulpAuth(encoded)).toBeNull();
  });
});
