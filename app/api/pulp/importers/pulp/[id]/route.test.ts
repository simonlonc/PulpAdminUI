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

import { DELETE, GET, PATCH } from "@/app/api/pulp/importers/pulp/[id]/route";

const IMPORTER_HREF = "/pulp/api/v3/importers/core/pulp/abc/";
const IMPORTER = {
  pulp_href: IMPORTER_HREF,
  name: "aa-test",
  repo_mapping: { "aa-probe-src": "aa-probe-dst" },
};

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(id: string, body: unknown) {
  return new Request(`http://pulp.test/api/pulp/importers/pulp/${id}`, {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/pulp/importers/pulp/[id]", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    fetchMock = vi.fn(async () => new Response(JSON.stringify(IMPORTER), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("identifier validation", () => {
    it("returns a 400 with a detail instead of throwing when id is a malformed '%'", async () => {
      const request = new Request("http://pulp.test/api/pulp/importers/pulp/%");

      for (const handler of [GET, PATCH, DELETE]) {
        const response = await handler(request, paramsFor("%"));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ detail: "Invalid importer identifier." });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ["a different resource", "/pulp/api/v3/users/1/"],
      ["a content guard", "/pulp/api/v3/contentguards/core/header/abc/"],
      ["an exporter", "/pulp/api/v3/exporters/core/pulp/abc/"],
      ["a bare name", "abc"],
      ["dot-segments walking out of the importers tree", "/pulp/api/v3/importers/core/pulp/../../../users/1/"],
      ["encoded dot-segments walking out of the importers tree", "/pulp/api/v3/importers/core/pulp/%2e%2e/%2e%2e/users/1/"],
      ["an import href", `${IMPORTER_HREF}imports/def/`],
      ["the importer collection itself", "/pulp/api/v3/importers/core/pulp/"],
      ["the import-check route, relative", "/pulp/api/v3/importers/core/pulp/import-check/"],
      ["the import-check route, absolute and without a trailing slash", "http://pulp.test/pulp/api/v3/importers/core/pulp/import-check"],
      ["the bare name import-check", "import-check"],
      ["an empty string", ""],
    ])("returns a 400 and never calls Pulp for %s", async (_label, href) => {
      const id = encodeURIComponent(href);
      const request = new Request(`http://pulp.test/api/pulp/importers/pulp/${id}`);

      for (const handler of [GET, PATCH, DELETE]) {
        const response = await handler(request, paramsFor(id));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ detail: "Invalid importer identifier." });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("GET", () => {
    it("reads the importer at its href, whether the id is relative or absolute", async () => {
      for (const href of [IMPORTER_HREF, `http://pulp.test${IMPORTER_HREF}`]) {
        const id = encodeURIComponent(href);
        const response = await GET(new Request(`http://pulp.test/api/pulp/importers/pulp/${id}`), paramsFor(id));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(IMPORTER);
      }
      for (const [url] of fetchMock.mock.calls as [string][]) {
        expect(url).toBe(`http://pulp.test${IMPORTER_HREF}`);
      }
    });

    it("surfaces an upstream 404 as its status and detail", async () => {
      fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ detail: "Not found." }), { status: 404 })
      );
      vi.stubGlobal("fetch", fetchMock);
      const id = encodeURIComponent(IMPORTER_HREF);

      const response = await GET(new Request(`http://pulp.test/api/pulp/importers/pulp/${id}`), paramsFor(id));

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ detail: "Not found." });
    });
  });

  describe("PATCH", () => {
    const id = encodeURIComponent(IMPORTER_HREF);

    it("forwards name and a trimmed repo_mapping and returns the updated importer", async () => {
      const response = await PATCH(
        patchRequest(id, {
          name: " renamed ",
          repo_mapping: { " aa-probe-src ": " aa-probe-dst ", "": "x" },
          ignored: "x",
        }),
        paramsFor(id)
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(IMPORTER);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://pulp.test${IMPORTER_HREF}`);
      expect(init.method).toBe("PATCH");
      expect(JSON.parse(String(init.body))).toEqual({
        name: "renamed",
        repo_mapping: { "aa-probe-src": "aa-probe-dst" },
      });
    });

    it("sends only the fields that were given, and can clear repo_mapping", async () => {
      await PATCH(patchRequest(id, { repo_mapping: {} }), paramsFor(id));

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({ repo_mapping: {} });
    });

    it("rejects a body with no importer field with 400 and never calls Pulp", async () => {
      const response = await PATCH(patchRequest(id, { ignored: "x" }), paramsFor(id));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "At least one importer field must be provided." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a non-object repo_mapping with 400 and never calls Pulp", async () => {
      for (const repoMapping of ["a=b", null, ["a"], { a: 1 }]) {
        const response = await PATCH(patchRequest(id, { repo_mapping: repoMapping }), paramsFor(id));

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ detail: "repo_mapping must be an object of repository names." });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a literal null body with 400 instead of throwing a raw TypeError", async () => {
      const response = await PATCH(patchRequest(id, "null"), paramsFor(id));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Invalid request body." });
    });

    it("surfaces Pulp's bare-list 400 for a missing repository with its message and no index prefix", async () => {
      fetchMock = vi.fn(
        async () =>
          new Response(
            JSON.stringify(["Failed to find repositories from repo_mapping: names: ['aa-probe-dst']"]),
            { status: 400 }
          )
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await PATCH(
        patchRequest(id, { repo_mapping: { "aa-probe-src": "aa-probe-dst" } }),
        paramsFor(id)
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        detail: "Failed to find repositories from repo_mapping: names: ['aa-probe-dst']",
      });
    });
  });

  describe("DELETE", () => {
    it("deletes the importer (Pulp answers 204) and returns ok", async () => {
      fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
      vi.stubGlobal("fetch", fetchMock);
      const id = encodeURIComponent(IMPORTER_HREF);

      const response = await DELETE(
        new Request(`http://pulp.test/api/pulp/importers/pulp/${id}`, { method: "DELETE" }),
        paramsFor(id)
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://pulp.test${IMPORTER_HREF}`);
      expect(init.method).toBe("DELETE");
    });

    it("surfaces an upstream failure as its status and detail", async () => {
      fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ detail: "Not found." }), { status: 404 })
      );
      vi.stubGlobal("fetch", fetchMock);
      const id = encodeURIComponent(IMPORTER_HREF);

      const response = await DELETE(
        new Request(`http://pulp.test/api/pulp/importers/pulp/${id}`, { method: "DELETE" }),
        paramsFor(id)
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ detail: "Not found." });
    });
  });
});
