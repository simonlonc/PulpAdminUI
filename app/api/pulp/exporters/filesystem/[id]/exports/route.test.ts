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

import { GET, POST } from "@/app/api/pulp/exporters/filesystem/[id]/exports/route";

const EXPORTER_HREF = "/pulp/api/v3/exporters/core/filesystem/abc/";
const TASK = "/pulp/api/v3/tasks/0192/";
const PUBLICATION = "/pulp/api/v3/publications/file/file/pub/";
const VERSION = "/pulp/api/v3/repositories/file/file/one/versions/2/";

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function postRequest(id: string, body: unknown) {
  return new Request(`http://pulp.test/api/pulp/exporters/filesystem/${id}/exports`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/pulp/exporters/filesystem/[id]/exports", () => {
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
      ["a pulp exporter", encodeURIComponent("/pulp/api/v3/exporters/core/pulp/abc/")],
      [
        "dot-segments walking out of the filesystem exporters tree",
        encodeURIComponent("/pulp/api/v3/exporters/core/filesystem/../../../users/1/"),
      ],
      ["an export href", encodeURIComponent(`${EXPORTER_HREF}exports/def/`)],
    ])("returns a 400 and never calls Pulp for %s", async (_label, badId) => {
      for (const handler of [GET, POST]) {
        const response = await handler(
          new Request(`http://pulp.test/api/pulp/exporters/filesystem/${badId}/exports`, {
            method: handler === GET ? "GET" : "POST",
            body: handler === GET ? undefined : JSON.stringify({ publication: PUBLICATION }),
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
          `http://pulp.test/api/pulp/exporters/filesystem/${id}/exports?limit=5&offset=10&ordering=-pulp_created&q=x&pulp_label_select=env`
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

      await GET(
        new Request(`http://pulp.test/api/pulp/exporters/filesystem/${id}/exports`),
        paramsFor(id)
      );

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(Object.fromEntries(new URL(url).searchParams)).toEqual({ limit: "200", offset: "0" });
    });
  });

  describe("POST", () => {
    it("exports a publication: normalizes its href and returns the task", async () => {
      const response = await POST(
        postRequest(id, {
          publication: ` http://pulp.test${PUBLICATION} `,
          full: true,
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
      expect(JSON.parse(String(init.body))).toEqual({ publication: PUBLICATION });
    });

    it("exports a repository version, with an optional start_repository_version", async () => {
      await POST(
        postRequest(id, {
          repository_version: "/repositories/file/file/one/versions/2/",
          start_repository_version: `http://pulp.test/pulp/api/v3/repositories/file/file/one/versions/1/`,
        }),
        paramsFor(id)
      );

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        repository_version: VERSION,
        start_repository_version: "/pulp/api/v3/repositories/file/file/one/versions/1/",
      });
    });

    it.each([
      ["neither source", {}],
      ["both sources", { publication: PUBLICATION, repository_version: VERSION }],
      ["only a start_repository_version", { start_repository_version: VERSION }],
      ["blank sources", { publication: "  ", repository_version: "" }],
      ["non-string sources", { publication: 42, repository_version: ["x"] }],
      ["null sources", { publication: null, repository_version: null }],
    ])("rejects %s with 400 and never calls Pulp", async (_label, body) => {
      const response = await POST(postRequest(id, body), paramsFor(id));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        detail: "Exactly one of publication or repository_version is required.",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("treats a blank source as absent, so one real source is enough", async () => {
      await POST(postRequest(id, { publication: PUBLICATION, repository_version: "  " }), paramsFor(id));

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({ publication: PUBLICATION });
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
          new Response(JSON.stringify({ publication: ["Invalid hyperlink - Object does not exist."] }), {
            status: 400,
          })
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await POST(postRequest(id, { publication: PUBLICATION }), paramsFor(id));

      expect(response.status).toBe(400);
      expect((await response.json()).detail).toContain("Invalid hyperlink - Object does not exist.");
    });
  });
});
