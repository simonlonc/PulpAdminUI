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

import { GET, POST } from "@/app/api/pulp/exporters/pulp/[id]/exports/route";

const EXPORTER_HREF = "/pulp/api/v3/exporters/core/pulp/abc/";
const TASK = "/pulp/api/v3/tasks/0192/";

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function postRequest(id: string, body: unknown) {
  return new Request(`http://pulp.test/api/pulp/exporters/pulp/${id}/exports`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/pulp/exporters/pulp/[id]/exports", () => {
  const id = encodeURIComponent(EXPORTER_HREF);
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ task: TASK }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("identifier validation", () => {
    it.each([
      ["a malformed percent-encoding", "%"],
      ["a different resource", encodeURIComponent("/pulp/api/v3/users/1/")],
      [
        "dot-segments walking out of the exporters tree",
        encodeURIComponent("/pulp/api/v3/exporters/core/pulp/../../../users/1/"),
      ],
      ["an export href", encodeURIComponent(`${EXPORTER_HREF}exports/def/`)],
    ])("returns a 400 and never calls Pulp for %s", async (_label, badId) => {
      for (const handler of [GET, POST]) {
        const response = await handler(
          new Request(`http://pulp.test/api/pulp/exporters/pulp/${badId}/exports`, {
            method: handler === GET ? "GET" : "POST",
            body: handler === GET ? undefined : "{}",
          }),
          paramsFor(badId)
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ detail: "Invalid exporter identifier." });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("GET", () => {
    it("forwards only limit and offset to the exporter's exports list", async () => {
      fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), {
            status: 200,
          })
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await GET(
        new Request(
          `http://pulp.test/api/pulp/exporters/pulp/${id}/exports?limit=5&offset=10&ordering=-pulp_created&q=x&pulp_label_select=env`
        ),
        paramsFor(id)
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ count: 0, next: null, previous: null, results: [] });
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      const upstream = new URL(url);
      expect(upstream.pathname).toBe(`${EXPORTER_HREF}exports/`);
      expect(Object.fromEntries(upstream.searchParams)).toEqual({ limit: "5", offset: "10" });
    });

    it("applies the usual limit and offset defaults when none are given", async () => {
      fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), {
            status: 200,
          })
      );
      vi.stubGlobal("fetch", fetchMock);

      await GET(new Request(`http://pulp.test/api/pulp/exporters/pulp/${id}/exports`), paramsFor(id));

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(Object.fromEntries(new URL(url).searchParams)).toEqual({ limit: "200", offset: "0" });
    });
  });

  describe("POST", () => {
    it("forwards only the fields that are present and of the right type, and returns the task", async () => {
      const response = await POST(
        postRequest(id, {
          full: "yes",
          dry_run: true,
          chunk_size: " 500MB ",
          versions: [],
          start_versions: ["http://pulp.test/pulp/api/v3/repositories/file/file/one/versions/1/"],
          meta: ["not", "an", "object"],
          ignored: "x",
        }),
        paramsFor(id)
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ task: TASK });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://pulp.test${EXPORTER_HREF}exports/`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({
        dry_run: true,
        chunk_size: "500MB",
        start_versions: ["/pulp/api/v3/repositories/file/file/one/versions/1/"],
      });
    });

    it("forwards a full export of explicit versions with meta", async () => {
      await POST(
        postRequest(id, {
          full: false,
          dry_run: false,
          versions: ["/repositories/file/file/one/versions/2/"],
          meta: { note: "weekly" },
        }),
        paramsFor(id)
      );

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        full: false,
        dry_run: false,
        versions: ["/pulp/api/v3/repositories/file/file/one/versions/2/"],
        meta: { note: "weekly" },
      });
    });

    it("drops a blank chunk_size and a null meta", async () => {
      await POST(postRequest(id, { chunk_size: "   ", meta: null }), paramsFor(id));

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({});
    });

    it("rejects a non-array versions with 400 and never calls Pulp", async () => {
      const response = await POST(postRequest(id, { versions: "latest" }), paramsFor(id));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "versions must be an array of strings." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a literal null body with 400 instead of throwing a raw TypeError", async () => {
      const response = await POST(postRequest(id, "null"), paramsFor(id));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Invalid request body." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("surfaces Pulp's own validation message as a 400", async () => {
      fetchMock = vi.fn(
        async () =>
          new Response(
            JSON.stringify({ chunk_size: ["chunk_size 'abc' is not valid (valid units are B/KB/MB/GB/TB)"] }),
            { status: 400 }
          )
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await POST(postRequest(id, { chunk_size: "abc" }), paramsFor(id));

      expect(response.status).toBe(400);
      expect((await response.json()).detail).toContain("chunk_size 'abc' is not valid");
    });
  });
});
