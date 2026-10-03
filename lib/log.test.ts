import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logError, logInfo, logWarn, resolveLogLevel } from "@/lib/log";
import { PULP_AUTH_COOKIE, encodePulpAuth } from "@/lib/pulp";

let lines: string[] = [];

beforeEach(() => {
  lines = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("log output", () => {
  it("writes one JSON line with level, event and the fields", () => {
    logError("pulp_fetch_failed", { status: 502, path: "/repositories/rpm/rpm/", ms: 31 });

    expect(lines).toEqual([
      '{"level":"error","event":"pulp_fetch_failed","status":502,"path":"/repositories/rpm/rpm/","ms":31}\n',
    ]);
  });

  it("does not let a field overwrite level or event", () => {
    logWarn("real_event", { level: "error", event: "fake_event" });

    expect(JSON.parse(lines[0])).toEqual({ level: "warn", event: "real_event" });
  });

  it("takes no fields at all", () => {
    logInfo("started");

    expect(JSON.parse(lines[0])).toEqual({ level: "info", event: "started" });
  });
});

describe("LOG_LEVEL", () => {
  const calls = { error: logError, warn: logWarn, info: logInfo };
  const expected = {
    error: ["error"],
    warn: ["error", "warn"],
    info: ["error", "warn", "info"],
  };

  for (const [level, emitted] of Object.entries(expected)) {
    it(`${level} emits ${emitted.join(", ")}`, () => {
      vi.stubEnv("LOG_LEVEL", level);

      for (const call of Object.values(calls)) {
        call("e");
      }

      expect(lines.map((line) => JSON.parse(line).level)).toEqual(emitted);
    });
  }

  it("defaults to info when unset", () => {
    vi.stubEnv("LOG_LEVEL", "");

    expect(resolveLogLevel()).toBe("info");
  });

  it("falls back to info for an invalid value, and ignores case and padding", () => {
    vi.stubEnv("LOG_LEVEL", "verbose");
    expect(resolveLogLevel()).toBe("info");

    vi.stubEnv("LOG_LEVEL", " WARN ");
    expect(resolveLogLevel()).toBe("warn");
  });
});

describe("redaction", () => {
  const pulpAuthCookie = () => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");

    return encodePulpAuth({ username: "alice", password: "hunter2-hunter2" });
  };

  it("redacts a password passed under a credential key", () => {
    logError("login_failed", { username: "alice", password: "hunter2-hunter2", Password: "x-y-z" });

    const line = JSON.parse(lines[0]);

    expect(line.username).toBe("alice");
    expect(line.password).toBe("[redacted]");
    expect(line.Password).toBe("[redacted]");
    expect(lines[0]).not.toContain("hunter2");
  });

  it("redacts a pulp_auth cookie value under its own key, under cookie, and inside a cookie header", () => {
    const value = pulpAuthCookie();

    logError("e", {
      [PULP_AUTH_COOKIE]: value,
      cookie: `${PULP_AUTH_COOKIE}=${value}`,
      detail: `request carried ${PULP_AUTH_COOKIE}=${value}; theme=dark`,
    });

    expect(lines[0]).not.toContain(value);
    expect(JSON.parse(lines[0]).detail).toBe("request carried pulp_auth=[redacted]; theme=dark");
  });

  it("redacts a bare encoded pulp_auth value under an innocent key", () => {
    const value = pulpAuthCookie();

    logError("e", { detail: value, note: `got ${value} from the browser` });

    expect(lines[0]).not.toContain(value);
  });

  it("redacts an Authorization header under its own key and as a value under any key", () => {
    const basic = `Basic ${Buffer.from("alice:hunter2-hunter2").toString("base64")}`;

    logWarn("e", {
      Authorization: basic,
      authorization: "Bearer abc.def.ghi",
      detail: `upstream said no to ${basic}`,
      header: "Bearer abc.def.ghi",
    });

    const line = JSON.parse(lines[0]);

    expect(line.Authorization).toBe("[redacted]");
    expect(line.authorization).toBe("[redacted]");
    expect(line.detail).toBe("upstream said no to Basic [redacted]");
    expect(line.header).toBe("Bearer [redacted]");
    expect(lines[0]).not.toContain("hunter2");
    expect(lines[0]).not.toContain("abc.def.ghi");
    expect(lines[0]).not.toContain(Buffer.from("alice:hunter2-hunter2").toString("base64"));
  });

  it("redacts userinfo in a URL, including inside a stack", () => {
    logError("e", {
      url: "https://alice:hunter2@pulp.test/pulp/api/v3/",
      stack: "Error: connect ECONNREFUSED\n    at fetch (https://alice:hunter2@pulp.test/x)",
    });

    expect(lines[0]).not.toContain("hunter2");
    expect(JSON.parse(lines[0]).url).toBe("https://[redacted]@pulp.test/pulp/api/v3/");
  });

  it("leaves ordinary values alone, and booleans and null under credential keys", () => {
    logInfo("startup", {
      session_secret_set: true,
      token: null,
      base_url: "http://pulp.test/pulp/api/v3",
      detail: "validation failed for field name",
      sha256: "a".repeat(64),
    });

    expect(JSON.parse(lines[0])).toEqual({
      level: "info",
      event: "startup",
      session_secret_set: true,
      token: null,
      base_url: "http://pulp.test/pulp/api/v3",
      detail: "validation failed for field name",
      sha256: "a".repeat(64),
    });
  });

  it("does not accept an object where a primitive belongs", () => {
    const auth = { username: "alice", password: "hunter2" };

    // @ts-expect-error a PulpAuth cannot be a field value
    logError("e", { auth });
    // @ts-expect-error a headers object cannot be a field value
    logError("e", { headers: new Headers({ authorization: "Basic abc" }) });
    // @ts-expect-error a headers object cannot be the fields
    logError("e", new Headers());
  });
});
