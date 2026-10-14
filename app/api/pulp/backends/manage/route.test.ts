import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodePulpAuth } from "@/lib/pulp";

const { cookieState } = vi.hoisted(() => ({
  cookieState: { value: undefined as string | undefined },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieState.value === undefined ? undefined : { name, value: cookieState.value },
    delete: () => {
      cookieState.value = undefined;
    },
    set: () => {},
  }),
}));

import { GET, POST } from "@/app/api/pulp/backends/manage/route";
import { DELETE, PATCH } from "@/app/api/pulp/backends/manage/[id]/route";

const NEW_URL = "http://new.test/pulp/api/v3";

function backend(id: string, label: string) {
  return {
    id,
    label,
    baseUrl: `http://${id}.test/pulp/api/v3`,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function jsonRequest(method: string, body?: unknown) {
  return new Request("http://app.test/api/pulp/backends/manage", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function pulpStatus() {
  return new Response(JSON.stringify({ versions: [] }), { status: 200 });
}

describe("/api/pulp/backends/manage", () => {
  let directory: string;
  let file: string;
  let fetchMock: ReturnType<typeof vi.fn>;
  // What the signed-in user's own Pulp answers to the superuser test.
  let gate: () => Promise<Response>;
  // What the server being added or changed answers to the reachability probe.
  let probe: () => Promise<Response>;

  const savedList = async () => JSON.parse(await readFile(file, "utf8")) as ReturnType<typeof backend>[];
  const probedUrls = () =>
    fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.endsWith("/status/"));

  beforeEach(async () => {
    // The store failure below is logged at error level; keep that line out of the test output.
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    directory = await mkdtemp(join(tmpdir(), "pulp-backends-manage-test-"));
    file = join(directory, "pulp-backends.json");
    await writeFile(file, JSON.stringify([backend("a", "Alpha"), backend("b", "Bravo")]));
    vi.stubEnv("PULP_BACKENDS_FILE", file);
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin", backendId: "a" });

    gate = async () => new Response(JSON.stringify({ count: 0, results: [] }), { status: 200 });
    probe = async () => pulpStatus();
    fetchMock = vi.fn(async (url: string) =>
      String(url).includes("/access_policies/") ? gate() : probe()
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  });

  describe("for a user who is not a Pulp superuser", () => {
    beforeEach(() => {
      gate = async () =>
        new Response(JSON.stringify({ detail: "You do not have permission to perform this action." }), {
          status: 403,
        });
    });

    const calls: [string, () => Promise<Response>][] = [
      ["GET", () => GET(jsonRequest("GET"), undefined)],
      ["POST", () => POST(jsonRequest("POST", { label: "New", baseUrl: NEW_URL }), undefined)],
      ["PATCH", () => PATCH(jsonRequest("PATCH", { label: "Renamed" }), context("b"))],
      ["DELETE", () => DELETE(jsonRequest("DELETE"), context("b"))],
    ];

    it.each(calls)("%s answers 403, leaves the list alone and probes nothing", async (_method, call) => {
      const before = await readFile(file, "utf8");

      const response = await call();

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        detail: "Only a Pulp superuser can manage the Pulp server list.",
      });
      expect(await readFile(file, "utf8")).toBe(before);
      expect(probedUrls()).toEqual([]);
    });
  });

  it("passes on another failure of the superuser test instead of calling it a 403", async () => {
    gate = async () => new Response(JSON.stringify({ detail: "Bad gateway." }), { status: 502 });

    const response = await GET(jsonRequest("GET"), undefined);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ detail: "Bad gateway." });
  });

  describe("GET", () => {
    it("lists every server with its base URL and creation time, asking the signed-in server", async () => {
      const response = await GET(jsonRequest("GET"), undefined);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([backend("a", "Alpha"), backend("b", "Bravo")]);
      expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
        "http://a.test/pulp/api/v3/access_policies/?limit=1",
      ]);
    });

    it("answers a readable JSON 500 when the list file cannot be read", async () => {
      // The session check has passed by the time the superuser test runs, so break the file there.
      gate = async () => {
        await writeFile(file, "{ not json");
        return new Response(JSON.stringify({ count: 0, results: [] }), { status: 200 });
      };

      const response = await GET(jsonRequest("GET"), undefined);

      expect(response.status).toBe(500);
      const body = await response.text();
      expect(JSON.parse(body)).toEqual({ detail: "The Pulp server list cannot be read or saved." });
      expect(body).not.toContain(directory);
    });
  });

  describe("POST", () => {
    it("probes the normalized URL without credentials, then saves and returns the new server", async () => {
      const response = await POST(jsonRequest("POST", { label: " New ", baseUrl: `${NEW_URL}/` }), undefined);

      expect(response.status).toBe(201);
      const created = await response.json();
      expect(created).toEqual({
        id: expect.any(String),
        label: "New",
        baseUrl: NEW_URL,
        createdAt: expect.any(String),
      });
      expect(await savedList()).toEqual([backend("a", "Alpha"), backend("b", "Bravo"), created]);

      expect(probedUrls()).toEqual([`${NEW_URL}/status/`]);
      const [, init] = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/status/")) as [
        string,
        RequestInit,
      ];
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.headers).toEqual({ Accept: "application/json" });
    });

    it("answers 400 and saves nothing when the server cannot be reached", async () => {
      probe = async () => {
        throw new TypeError("fetch failed", { cause: new Error("connect ECONNREFUSED 127.0.0.1:1") });
      };

      const response = await POST(jsonRequest("POST", { label: "New", baseUrl: NEW_URL }), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        detail: `Could not reach a Pulp server at ${NEW_URL}: connect ECONNREFUSED 127.0.0.1:1.`,
      });
      expect(await savedList()).toEqual([backend("a", "Alpha"), backend("b", "Bravo")]);
    });

    it("answers 400 and saves nothing when the probe times out", async () => {
      probe = async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      };

      const response = await POST(jsonRequest("POST", { label: "New", baseUrl: NEW_URL }), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        detail: `Could not reach a Pulp server at ${NEW_URL}: The operation was aborted due to timeout.`,
      });
      expect(await savedList()).toEqual([backend("a", "Alpha"), backend("b", "Bravo")]);
    });

    it.each([
      ["a 404", () => new Response("Not found", { status: 404 }), "/status/ returned 404."],
      ["an HTML page", () => new Response("<html></html>", { status: 200 }), "/status/ did not return a Pulp status."],
      [
        "JSON without versions",
        () => new Response(JSON.stringify({ versions: "none" }), { status: 200 }),
        "/status/ did not return a Pulp status.",
      ],
    ])("answers 400 and saves nothing when /status/ is %s", async (_name, answer, problem) => {
      probe = async () => answer();

      const response = await POST(jsonRequest("POST", { label: "New", baseUrl: NEW_URL }), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        detail: `${NEW_URL} did not answer like a Pulp API: ${problem}`,
      });
      expect(await savedList()).toEqual([backend("a", "Alpha"), backend("b", "Bravo")]);
    });

    it.each([
      ["a scheme that is not http(s)", "ftp://new.test/pulp/api/v3"],
      ["userinfo", "http://user:secret@new.test/pulp/api/v3"],
      ["something that is not a URL", "new.test"],
      ["no value", undefined],
    ])("rejects a base URL with %s without fetching it", async (_name, baseUrl) => {
      const response = await POST(jsonRequest("POST", { label: "New", baseUrl }), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: expect.stringContaining("Base URL") });
      expect(probedUrls()).toEqual([]);
      expect(await savedList()).toEqual([backend("a", "Alpha"), backend("b", "Bravo")]);
    });

    it("answers 400 and saves nothing for an empty label", async () => {
      const response = await POST(jsonRequest("POST", { label: " ", baseUrl: NEW_URL }), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Label must be a non-empty string." });
      expect(await savedList()).toEqual([backend("a", "Alpha"), backend("b", "Bravo")]);
    });
  });

  describe("PATCH", () => {
    it("renames without probing", async () => {
      const response = await PATCH(jsonRequest("PATCH", { label: "Renamed" }), context("b"));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ...backend("b", "Renamed") });
      expect(await savedList()).toEqual([backend("a", "Alpha"), backend("b", "Renamed")]);
      expect(probedUrls()).toEqual([]);
    });

    it("probes a changed base URL, then saves it", async () => {
      const response = await PATCH(jsonRequest("PATCH", { baseUrl: `${NEW_URL}/` }), context("b"));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ...backend("b", "Bravo"), baseUrl: NEW_URL });
      expect(probedUrls()).toEqual([`${NEW_URL}/status/`]);
      expect((await savedList())[1].baseUrl).toBe(NEW_URL);
    });

    it("does not probe a base URL that is the saved one, so a server that is down can be renamed", async () => {
      probe = async () => {
        throw new TypeError("fetch failed");
      };

      const response = await PATCH(
        jsonRequest("PATCH", { label: "Renamed", baseUrl: "http://b.test/pulp/api/v3/" }),
        context("b")
      );

      expect(response.status).toBe(200);
      expect(probedUrls()).toEqual([]);
      expect(await savedList()).toEqual([backend("a", "Alpha"), backend("b", "Renamed")]);
    });

    it("answers 400 and changes nothing when the new base URL is not a Pulp", async () => {
      probe = async () => new Response("Not found", { status: 404 });

      const response = await PATCH(
        jsonRequest("PATCH", { label: "Renamed", baseUrl: NEW_URL }),
        context("b")
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        detail: `${NEW_URL} did not answer like a Pulp API: /status/ returned 404.`,
      });
      expect(await savedList()).toEqual([backend("a", "Alpha"), backend("b", "Bravo")]);
    });

    it("rejects an invalid base URL without fetching it", async () => {
      const response = await PATCH(jsonRequest("PATCH", { baseUrl: "ftp://new.test" }), context("b"));

      expect(response.status).toBe(400);
      expect(probedUrls()).toEqual([]);
      expect(await savedList()).toEqual([backend("a", "Alpha"), backend("b", "Bravo")]);
    });

    it("answers 404 for an unknown id without probing", async () => {
      const response = await PATCH(jsonRequest("PATCH", { baseUrl: NEW_URL }), context("nope"));

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ detail: "Pulp server not found." });
      expect(probedUrls()).toEqual([]);
    });

    it("answers 400 when there is nothing to change", async () => {
      const response = await PATCH(jsonRequest("PATCH", {}), context("b"));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Provide a label or a base URL to update." });
    });
  });

  describe("DELETE", () => {
    it("removes the server", async () => {
      const response = await DELETE(jsonRequest("DELETE"), context("b"));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(await savedList()).toEqual([backend("a", "Alpha")]);
    });

    it("answers 404 for an unknown id", async () => {
      const response = await DELETE(jsonRequest("DELETE"), context("nope"));

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ detail: "Pulp server not found." });
      expect(await savedList()).toEqual([backend("a", "Alpha"), backend("b", "Bravo")]);
    });

    it("refuses to remove the server the session is signed in to", async () => {
      const response = await DELETE(jsonRequest("DELETE"), context("a"));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        detail: "You cannot remove the Pulp server you are signed in to.",
      });
      expect(await savedList()).toEqual([backend("a", "Alpha"), backend("b", "Bravo")]);
    });

    it("counts a session without a backend id as signed in to the default server", async () => {
      await writeFile(file, JSON.stringify([backend("default", "Default"), backend("b", "Bravo")]));
      cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });

      const response = await DELETE(jsonRequest("DELETE"), context("default"));

      expect(response.status).toBe(400);
      expect(await savedList()).toEqual([backend("default", "Default"), backend("b", "Bravo")]);
    });
  });
});
