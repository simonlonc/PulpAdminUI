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

import { GET, POST } from "@/app/api/pulp/importers/pulp/[id]/imports/route";

const IMPORTER_HREF = "/pulp/api/v3/importers/core/pulp/abc/";
const TASK_GROUP = "/pulp/api/v3/task-groups/0192/";

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function postRequest(id: string, body: unknown) {
  return new Request(`http://pulp.test/api/pulp/importers/pulp/${id}/imports`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/pulp/importers/pulp/[id]/imports", () => {
  const id = encodeURIComponent(IMPORTER_HREF);
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ task_group: TASK_GROUP }), { status: 202 })
    );
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
        "dot-segments walking out of the importers tree",
        encodeURIComponent("/pulp/api/v3/importers/core/pulp/../../../users/1/"),
      ],
      ["an import href", encodeURIComponent(`${IMPORTER_HREF}imports/def/`)],
      ["the import-check route", encodeURIComponent("/pulp/api/v3/importers/core/pulp/import-check/")],
    ])("returns a 400 and never calls Pulp for %s", async (_label, badId) => {
      for (const handler of [GET, POST]) {
        const response = await handler(
          new Request(`http://pulp.test/api/pulp/importers/pulp/${badId}/imports`, {
            method: handler === GET ? "GET" : "POST",
            body: handler === GET ? undefined : JSON.stringify({ path: "/var/lib/pulp/exports/x.tar" }),
          }),
          paramsFor(badId)
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ detail: "Invalid importer identifier." });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("GET", () => {
    it("forwards only limit and offset to the importer's imports list", async () => {
      fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), {
            status: 200,
          })
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await GET(
        new Request(
          `http://pulp.test/api/pulp/importers/pulp/${id}/imports?limit=5&offset=10&ordering=-pulp_created&q=x&pulp_label_select=env`
        ),
        paramsFor(id)
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ count: 0, next: null, previous: null, results: [] });
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      const upstream = new URL(url);
      expect(upstream.pathname).toBe(`${IMPORTER_HREF}imports/`);
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

      await GET(new Request(`http://pulp.test/api/pulp/importers/pulp/${id}/imports`), paramsFor(id));

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(Object.fromEntries(new URL(url).searchParams)).toEqual({ limit: "200", offset: "0" });
    });
  });

  describe("POST", () => {
    it("forwards only valid fields and returns the task group unchanged, not a task", async () => {
      const response = await POST(
        postRequest(id, {
          path: " /var/lib/pulp/exports/aa-probe/export.tar ",
          toc: "   ",
          create_repositories: true,
          ignored: "x",
        }),
        paramsFor(id)
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ task_group: TASK_GROUP });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://pulp.test${IMPORTER_HREF}imports/`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({
        path: "/var/lib/pulp/exports/aa-probe/export.tar",
        create_repositories: true,
      });
    });

    it("forwards a trimmed toc on its own and drops a non-boolean create_repositories", async () => {
      await POST(
        postRequest(id, {
          toc: " /var/lib/pulp/exports/aa-probe/export-toc.json ",
          create_repositories: "yes",
        }),
        paramsFor(id)
      );

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        toc: "/var/lib/pulp/exports/aa-probe/export-toc.json",
      });
    });

    it("forwards both path and toc when both are given and lets Pulp judge the pair", async () => {
      await POST(postRequest(id, { path: "/a.tar", toc: "/a-toc.json" }), paramsFor(id));

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({ path: "/a.tar", toc: "/a-toc.json" });
    });

    it.each([
      ["an empty body", {}],
      ["blank values", { path: "  ", toc: "" }],
      ["non-string values", { path: 42, toc: ["x"] }],
      ["only create_repositories", { create_repositories: true }],
    ])("requires a path or a toc: %s is a 400 and never calls Pulp", async (_label, body) => {
      const response = await POST(postRequest(id, body), paramsFor(id));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        detail: "An import path or a table-of-contents file is required.",
      });
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
          new Response(JSON.stringify({ path: ["Path '/tmp/x.tar' is not an allowed import path"] }), {
            status: 400,
          })
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await POST(postRequest(id, { path: "/tmp/x.tar" }), paramsFor(id));

      expect(response.status).toBe(400);
      expect((await response.json()).detail).toContain("Path '/tmp/x.tar' is not an allowed import path");
    });
  });
});
