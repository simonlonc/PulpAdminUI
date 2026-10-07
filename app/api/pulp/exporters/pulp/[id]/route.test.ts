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

import { DELETE, GET, PATCH } from "@/app/api/pulp/exporters/pulp/[id]/route";

const EXPORTER_HREF = "/pulp/api/v3/exporters/core/pulp/abc/";
const TASK = "/pulp/api/v3/tasks/0192/";

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(id: string, body: unknown) {
  return new Request(`http://pulp.test/api/pulp/exporters/pulp/${id}`, {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/pulp/exporters/pulp/[id]", () => {
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
    it("returns a 400 with a detail instead of throwing when id is a malformed '%'", async () => {
      const request = new Request("http://pulp.test/api/pulp/exporters/pulp/%");

      for (const handler of [GET, PATCH, DELETE]) {
        const response = await handler(request, paramsFor("%"));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ detail: "Invalid exporter identifier." });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ["a different resource", "/pulp/api/v3/users/1/"],
      ["a content guard", "/pulp/api/v3/contentguards/core/header/abc/"],
      ["a filesystem exporter", "/pulp/api/v3/exporters/core/filesystem/abc/"],
      ["a bare name", "abc"],
      ["dot-segments walking out of the exporters tree", "/pulp/api/v3/exporters/core/pulp/../../../users/1/"],
      ["encoded dot-segments walking out of the exporters tree", "/pulp/api/v3/exporters/core/pulp/%2e%2e/%2e%2e/users/1/"],
      ["an export href", `${EXPORTER_HREF}exports/def/`],
      ["an empty string", ""],
    ])("returns a 400 and never calls Pulp for %s", async (_label, href) => {
      const id = encodeURIComponent(href);
      const request = new Request(`http://pulp.test/api/pulp/exporters/pulp/${id}`);

      for (const handler of [GET, PATCH, DELETE]) {
        const response = await handler(request, paramsFor(id));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ detail: "Invalid exporter identifier." });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("GET", () => {
    it("reads the exporter at its href, whether the id is relative or absolute", async () => {
      fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ pulp_href: EXPORTER_HREF, name: "aa-test" }), { status: 200 })
      );
      vi.stubGlobal("fetch", fetchMock);

      for (const href of [EXPORTER_HREF, `http://pulp.test${EXPORTER_HREF}`]) {
        const id = encodeURIComponent(href);
        const response = await GET(new Request(`http://pulp.test/api/pulp/exporters/pulp/${id}`), paramsFor(id));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ pulp_href: EXPORTER_HREF, name: "aa-test" });
      }
      for (const [url] of fetchMock.mock.calls as [string][]) {
        expect(url).toBe(`http://pulp.test${EXPORTER_HREF}`);
      }
    });

    it("surfaces an upstream 404 as its status and detail", async () => {
      fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ detail: "Not found." }), { status: 404 })
      );
      vi.stubGlobal("fetch", fetchMock);
      const id = encodeURIComponent(EXPORTER_HREF);

      const response = await GET(new Request(`http://pulp.test/api/pulp/exporters/pulp/${id}`), paramsFor(id));

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ detail: "Not found." });
    });
  });

  describe("PATCH", () => {
    const id = encodeURIComponent(EXPORTER_HREF);

    it("forwards name, path and normalized repositories and returns the dispatched task", async () => {
      const response = await PATCH(
        patchRequest(id, {
          name: " renamed ",
          path: " /var/lib/pulp/exports/renamed ",
          repositories: ["http://pulp.test/pulp/api/v3/repositories/file/file/one/"],
          ignored: "x",
        }),
        paramsFor(id)
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ task: TASK });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://pulp.test${EXPORTER_HREF}`);
      expect(init.method).toBe("PATCH");
      expect(JSON.parse(String(init.body))).toEqual({
        name: "renamed",
        path: "/var/lib/pulp/exports/renamed",
        repositories: ["/pulp/api/v3/repositories/file/file/one/"],
      });
    });

    it("sends only the fields that were given, and can clear repositories", async () => {
      await PATCH(patchRequest(id, { repositories: [] }), paramsFor(id));

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({ repositories: [] });
    });

    it("answers task null when Pulp applies the update synchronously with a 200", async () => {
      fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ pulp_href: EXPORTER_HREF, name: "x" }), { status: 200 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await PATCH(patchRequest(id, { name: "x" }), paramsFor(id));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ task: null });
    });

    it("rejects a body with no exporter field with 400 and never calls Pulp", async () => {
      const response = await PATCH(patchRequest(id, { ignored: "x" }), paramsFor(id));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "At least one exporter field must be provided." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a non-array repositories with 400 and never calls Pulp", async () => {
      const response = await PATCH(patchRequest(id, { repositories: [null] }), paramsFor(id));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "repositories must be an array of strings." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a literal null body with 400 instead of throwing a raw TypeError", async () => {
      const response = await PATCH(patchRequest(id, "null"), paramsFor(id));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Invalid request body." });
    });

    it("surfaces Pulp's disallowed-export-path 400 with its message, not a 500", async () => {
      fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify({ path: ["Path '/tmp/x' is not an allowed export path"] }), {
            status: 400,
          })
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await PATCH(patchRequest(id, { path: "/tmp/x" }), paramsFor(id));

      expect(response.status).toBe(400);
      expect((await response.json()).detail).toContain("Path '/tmp/x' is not an allowed export path");
    });
  });

  describe("DELETE", () => {
    it("deletes the exporter and returns the dispatched task", async () => {
      const id = encodeURIComponent(EXPORTER_HREF);

      const response = await DELETE(
        new Request(`http://pulp.test/api/pulp/exporters/pulp/${id}`, { method: "DELETE" }),
        paramsFor(id)
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ task: TASK });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://pulp.test${EXPORTER_HREF}`);
      expect(init.method).toBe("DELETE");
    });

    it("surfaces an upstream failure as its status and detail", async () => {
      fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ detail: "Not found." }), { status: 404 })
      );
      vi.stubGlobal("fetch", fetchMock);
      const id = encodeURIComponent(EXPORTER_HREF);

      const response = await DELETE(
        new Request(`http://pulp.test/api/pulp/exporters/pulp/${id}`, { method: "DELETE" }),
        paramsFor(id)
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ detail: "Not found." });
    });
  });
});
