import { createServer } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  decodePulpAuth,
  encodePulpAuth,
  pulpErrorDetailFromBody,
  pulpFetch,
  takePulpAuthRenewal,
  type PulpAuth,
} from "@/lib/pulp";

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

  it("joins a bare top-level list of messages without an index prefix", () => {
    expect(
      pulpErrorDetailFromBody([
        "Failed to find repositories from repo_mapping: names: ['aa-probe-dst']",
      ])
    ).toBe("Failed to find repositories from repo_mapping: names: ['aa-probe-dst']");
    expect(pulpErrorDetailFromBody(["Error one.", "Error two."])).toBe("Error one. Error two.");
  });

  it("caps a bare top-level list at 500 characters", () => {
    const result = pulpErrorDetailFromBody(["a".repeat(400), "b".repeat(400)]);
    expect((result as string).length).toBe(500);
  });

  it("returns null for an empty bare top-level list", () => {
    expect(pulpErrorDetailFromBody([])).toBeNull();
    expect(pulpErrorDetailFromBody(["", "  "])).toBeNull();
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

  // Reconciled from the now-deleted formatPulpErrorPayload (app/api/pulp/repositories/_server.ts):
  // that formatter JSON.stringify'd a plain-object field value instead of dropping it, which this
  // formatter otherwise would. Keeping that behavior avoids silently losing error information.
  it("stringifies a plain-object field value instead of dropping it", () => {
    expect(pulpErrorDetailFromBody({ context: { field: "name", reason: "duplicate" } })).toBe(
      'context: {"field":"name","reason":"duplicate"}'
    );
  });

  it("caps an oversized detail at 500 characters, like pulpFetch's own non-JSON snippet cap (F-8)", () => {
    // Reproduces the exploratory run's 887-char counterexample: a deeply-nested field value
    // whose JSON.stringify'd form alone is already well past 500 characters.
    const oversizedNestedBody = {
      field: {
        aaaaaa: {
          bbbbbb: {
            cccccc: {
              dddddd: {
                eeeeee: [
                  "a".repeat(100),
                  "b".repeat(100),
                  "c".repeat(100),
                  "d".repeat(100),
                  "e".repeat(100),
                  "f".repeat(100),
                  "g".repeat(100),
                  "h".repeat(100),
                ],
              },
            },
          },
        },
      },
    };
    const result = pulpErrorDetailFromBody(oversizedNestedBody);
    expect(result).not.toBeNull();
    expect((result as string).length).toBeLessThanOrEqual(500);
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

describe("pulpFetch", () => {
  const auth: PulpAuth = { username: "admin", password: "recognizable-password" };
  let lines: string[] = [];

  beforeEach(() => {
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    vi.stubEnv("LOG_LEVEL", "info");
    lines = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function expectNoSecretsLogged(requestBody: string) {
    const output = lines.join("");
    expect(output).not.toContain("recognizable-password");
    expect(output).not.toContain(Buffer.from("admin:recognizable-password").toString("base64"));
    expect(output).not.toContain("Basic ");
    expect(output).not.toContain(requestBody);
  }

  it("returns a 502 with a detail naming the base URL when the server is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      })
    );

    const result = await pulpFetch("/status/", auth);

    expect(result).toEqual({
      ok: false,
      status: 502,
      detail: "Could not reach Pulp server at http://pulp.test/pulp/api/v3: connect ECONNREFUSED",
    });
  });

  it("F-13: returns ok:false with a detail when a 2xx response body is the literal null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("null", { status: 200, headers: { "Content-Type": "application/json" } }))
    );

    const result = await pulpFetch("/repositories/rpm/rpm/abc/", auth);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(typeof result.detail).toBe("string");
      expect(result.detail.length).toBeGreaterThan(0);
    }
  });

  it("F-13: returns ok:false with a detail when a 2xx response body is empty/unparseable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{", { status: 200, headers: { "Content-Type": "application/json" } }))
    );

    const result = await pulpFetch("/repositories/rpm/rpm/abc/", auth);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(typeof result.detail).toBe("string");
      expect(result.detail.length).toBeGreaterThan(0);
    }
  });

  it("keeps returning ok:true with no data for a 204 No Content body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 }))
    );

    const result = await pulpFetch("/users/1/", auth, { method: "DELETE" });

    expect(result).toEqual({ ok: true, status: 204, data: undefined });
  });

  it("logs one error line naming the host, port and errno when a real connection is refused", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    await new Promise((resolve) => server.close(resolve));
    vi.stubEnv("PULP_BASE_URL", `http://127.0.0.1:${port}/pulp/api/v3`);

    const result = await pulpFetch("/status/?search=secretish", auth, {
      method: "POST",
      body: JSON.stringify({ note: "request-body-marker" }),
    });

    expect(result.ok).toBe(false);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      level: "error",
      event: "pulp_fetch_unreachable",
      method: "POST",
      url: `http://127.0.0.1:${port}/pulp/api/v3/status/`,
      message: "fetch failed",
      cause_code: "ECONNREFUSED",
      cause_message: `connect ECONNREFUSED 127.0.0.1:${port}`,
      cause_address: "127.0.0.1",
    });
    expect(typeof JSON.parse(lines[0]).ms).toBe("number");
    expect(lines[0]).not.toContain("secretish");
    expectNoSecretsLogged("request-body-marker");
  });

  it("logs the cause code of a wrapped transport error and omits it when there is none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed", { cause: Object.assign(new Error("getaddrinfo ENOTFOUND pulp.test"), { code: "ENOTFOUND" }) });
      })
    );
    await pulpFetch("/status/", auth);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("plain failure");
      })
    );
    await pulpFetch("/status/", auth);

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({
      event: "pulp_fetch_unreachable",
      cause_code: "ENOTFOUND",
      cause_message: "getaddrinfo ENOTFOUND pulp.test",
    });
    expect(JSON.parse(lines[1])).not.toHaveProperty("cause_code");
    expect(JSON.parse(lines[1])).toMatchObject({ message: "plain failure" });
  });

  it("logs one warn line with status, method, url and detail for a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "Repository not found." }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          })
      )
    );

    const result = await pulpFetch("/repositories/rpm/rpm/abc/?name=secretish", auth, {
      method: "patch",
      body: JSON.stringify({ note: "request-body-marker" }),
    });

    expect(result).toEqual({ ok: false, status: 404, detail: "Repository not found." });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      level: "warn",
      event: "pulp_fetch_failed",
      method: "PATCH",
      url: "http://pulp.test/pulp/api/v3/repositories/rpm/rpm/abc/",
      status: 404,
      detail: "Repository not found.",
    });
    expect(typeof JSON.parse(lines[0]).ms).toBe("number");
    expect(lines[0]).not.toContain("secretish");
    expectNoSecretsLogged("request-body-marker");
  });

  it("logs one warn line for a 2xx whose body is empty or unparseable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{", { status: 200, headers: { "Content-Type": "application/json" } }))
    );

    await pulpFetch("/repositories/rpm/rpm/abc/", auth);

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      level: "warn",
      event: "pulp_fetch_bad_body",
      method: "GET",
      status: 200,
    });
  });

  it("logs a successful call only when it is slow", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        vi.advanceTimersByTime(6000);
        return new Response('{"ok":true}', { status: 200, headers: { "Content-Type": "application/json" } });
      })
    );

    const result = await pulpFetch("/status/", auth, { body: JSON.stringify({ note: "request-body-marker" }) });

    expect(result.ok).toBe(true);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      level: "warn",
      event: "pulp_fetch_slow",
      method: "GET",
      url: "http://pulp.test/pulp/api/v3/status/",
      status: 200,
      ms: 6000,
    });
    expectNoSecretsLogged("request-body-marker");
  });

  it("writes nothing for a fast successful call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { "Content-Type": "application/json" } }))
    );

    await pulpFetch("/status/", auth);

    expect(lines).toEqual([]);
  });
});

describe("Pulp session auth", () => {
  const session = { sessionid: "sess-old", csrftoken: "csrf-old" };
  let auth: PulpAuth;
  let fetchMock: ReturnType<typeof vi.fn>;

  function loginResponse(sessionid: string, csrftoken: string): Response {
    const headers = new Headers();
    headers.append("Set-Cookie", `csrftoken=${csrftoken}; Max-Age=31449600; Path=/`);
    headers.append("Set-Cookie", `sessionid=${sessionid}; HttpOnly; Max-Age=1209600; Path=/`);
    return new Response(JSON.stringify({ username: "admin" }), { status: 201, headers });
  }

  function jsonResponse(status: number, body: unknown = {}): Response {
    return new Response(JSON.stringify(body), { status });
  }

  function headersOf(call: number): Headers {
    return fetchMock.mock.calls[call][1].headers as Headers;
  }

  beforeEach(() => {
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    auth = { username: "admin", password: "pw", pulpSession: { ...session } };
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the session cookie and no Authorization on a read", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { count: 0 }));

    await pulpFetch("/repositories/", auth);

    expect(headersOf(0).get("Cookie")).toBe("sessionid=sess-old; csrftoken=csrf-old");
    expect(headersOf(0).has("Authorization")).toBe(false);
    expect(headersOf(0).has("X-CSRFToken")).toBe(false);
    expect(headersOf(0).has("Referer")).toBe(false);
  });

  it("adds X-CSRFToken and a same-origin Referer on unsafe methods only", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { ok: 1 }));

    for (const method of ["POST", "PATCH", "DELETE", "PUT"]) {
      fetchMock.mockClear();
      await pulpFetch("/x/", auth, { method, body: "{}" });
      expect(headersOf(0).get("X-CSRFToken")).toBe("csrf-old");
      expect(headersOf(0).get("Referer")).toBe("http://pulp.test/");
    }
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      fetchMock.mockClear();
      await pulpFetch("/x/", auth, { method });
      expect(headersOf(0).has("X-CSRFToken")).toBe(false);
      expect(headersOf(0).has("Referer")).toBe(false);
    }
  });

  it("sends Basic and no cookie without a session", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { count: 0 }));

    await pulpFetch("/x/", { username: "admin", password: "pw" });

    expect(headersOf(0).get("Authorization")).toMatch(/^Basic /);
    expect(headersOf(0).has("Cookie")).toBe(false);
  });

  it("renews the session once on a 401, retries, updates auth and marks the renewal", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { detail: "Authentication credentials were not provided." }))
      .mockResolvedValueOnce(loginResponse("sess-new", "csrf-new"))
      .mockResolvedValueOnce(jsonResponse(201, { task: "t" }));

    const result = await pulpFetch("/x/", auth, { method: "POST", body: JSON.stringify({ a: 1 }) });

    expect(result).toEqual({ ok: true, status: 201, data: { task: "t" } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toBe("http://pulp.test/pulp/api/v3/login/");
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toMatch(/^Basic /);
    expect(headersOf(2).get("Cookie")).toBe("sessionid=sess-new; csrftoken=csrf-new");
    expect(headersOf(2).get("X-CSRFToken")).toBe("csrf-new");
    expect(fetchMock.mock.calls[2][1].body).toBe(JSON.stringify({ a: 1 }));
    expect(auth.pulpSession).toEqual({ sessionid: "sess-new", csrftoken: "csrf-new" });
    expect(takePulpAuthRenewal(auth)).toBe(true);
    expect(takePulpAuthRenewal(auth)).toBe(false);
  });

  it("drops the session and retries with Basic when /login/ answers 404", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValueOnce(jsonResponse(404))
      .mockResolvedValueOnce(jsonResponse(200, { count: 0 }));

    const result = await pulpFetch("/x/", auth);

    expect(result.ok).toBe(true);
    expect(headersOf(2).get("Authorization")).toMatch(/^Basic /);
    expect(headersOf(2).has("Cookie")).toBe(false);
    expect(auth.pulpSession).toBeUndefined();
    expect(takePulpAuthRenewal(auth)).toBe(true);
  });

  it("returns the original 401 and leaves auth untouched when the renewal is refused", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { detail: "Session expired." }))
      .mockResolvedValueOnce(jsonResponse(401, { detail: "Invalid username/password." }));

    const result = await pulpFetch("/x/", auth);

    expect(result).toEqual({ ok: false, status: 401, detail: "Session expired." });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(auth.pulpSession).toEqual(session);
    expect(takePulpAuthRenewal(auth)).toBe(false);
  });

  it("retries only once when the renewed session is rejected too", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValueOnce(loginResponse("sess-new", "csrf-new"))
      .mockResolvedValueOnce(jsonResponse(401, { detail: "Nope." }));

    const result = await pulpFetch("/x/", auth);

    expect(result).toEqual({ ok: false, status: 401, detail: "Nope." });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shares one renewal between concurrent 401s", async () => {
    let loginCalls = 0;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (String(url).endsWith("/login/")) {
        loginCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return loginResponse("sess-new", "csrf-new");
      }
      const cookie = (init.headers as Headers).get("Cookie");
      return cookie === "sessionid=sess-new; csrftoken=csrf-new"
        ? jsonResponse(200, { count: 0 })
        : jsonResponse(401);
    });

    const results = await Promise.all([
      pulpFetch("/a/", auth),
      pulpFetch("/b/", auth),
      pulpFetch("/c/", auth),
    ]);

    expect(results.every((r) => r.ok)).toBe(true);
    expect(loginCalls).toBe(1);
  });

  it("renews but does not retry a streamed body", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { detail: "Session expired." }))
      .mockResolvedValueOnce(loginResponse("sess-new", "csrf-new"));
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x"));
        controller.close();
      },
    });

    const result = await pulpFetch("/x/", auth, {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);

    expect(result).toEqual({ ok: false, status: 401, detail: "Session expired." });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(auth.pulpSession).toEqual({ sessionid: "sess-new", csrftoken: "csrf-new" });
    expect(takePulpAuthRenewal(auth)).toBe(true);
  });

  it("does not renew a 401 for a request that used Basic", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { detail: "Bad password." }));

    const result = await pulpFetch("/x/", { username: "admin", password: "pw" });

    expect(result).toEqual({ ok: false, status: 401, detail: "Bad password." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("decodes a cookie written before sessions existed", () => {
    const encoded = encodePulpAuth({ username: "admin", password: "pw" });
    expect(decodePulpAuth(encoded)).toEqual({ username: "admin", password: "pw" });
  });

  it("round-trips a session through the encrypted cookie and rejects a malformed one", () => {
    expect(decodePulpAuth(encodePulpAuth(auth))).toEqual(auth);

    const bad = { username: "admin", password: "pw", pulpSession: { sessionid: 5 } };
    expect(decodePulpAuth(encodePulpAuth(bad as unknown as PulpAuth))).toBeNull();
  });
});
