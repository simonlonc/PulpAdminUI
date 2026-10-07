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

import { DELETE, GET } from "@/app/api/pulp/importers/pulp/[id]/imports/[importId]/route";

const IMPORTER_HREF = "/pulp/api/v3/importers/core/pulp/abc/";
const IMPORT_HREF = `${IMPORTER_HREF}imports/def/`;

function paramsFor(id: string, importId: string) {
  return { params: Promise.resolve({ id, importId }) };
}

describe("/api/pulp/importers/pulp/[id]/imports/[importId]", () => {
  const id = encodeURIComponent(IMPORTER_HREF);
  const importId = encodeURIComponent(IMPORT_HREF);
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("import identifier validation", () => {
    it.each([
      ["a malformed percent-encoding", "%"],
      ["a different resource", encodeURIComponent("/pulp/api/v3/users/1/")],
      ["an importer href with no /imports/ in it", encodeURIComponent(IMPORTER_HREF)],
      ["an export href", encodeURIComponent("/pulp/api/v3/exporters/core/pulp/abc/exports/def/")],
      [
        "dot-segments walking out of the importers tree",
        encodeURIComponent("/pulp/api/v3/importers/core/pulp/abc/imports/../../../../users/1/"),
      ],
      ["the import-check route", encodeURIComponent("/pulp/api/v3/importers/core/pulp/import-check/")],
      ["a bare name", "def"],
      ["an empty string", ""],
    ])("returns a 400 and never calls Pulp for %s", async (_label, badImportId) => {
      for (const handler of [GET, DELETE]) {
        const response = await handler(
          new Request(`http://pulp.test/api/pulp/importers/pulp/${id}/imports/${badImportId}`),
          paramsFor(id, badImportId)
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ detail: "Invalid import identifier." });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("GET", () => {
    it("reads the import at its href, whether the id is relative or absolute", async () => {
      fetchMock = vi.fn(
        async () =>
          new Response(
            JSON.stringify({ pulp_href: IMPORT_HREF, params: { toc: "/x/export-toc.json" } }),
            { status: 200 }
          )
      );
      vi.stubGlobal("fetch", fetchMock);

      for (const href of [IMPORT_HREF, `http://pulp.test${IMPORT_HREF}`]) {
        const response = await GET(
          new Request("http://pulp.test/x"),
          paramsFor(id, encodeURIComponent(href))
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          pulp_href: IMPORT_HREF,
          params: { toc: "/x/export-toc.json" },
        });
      }
      for (const [url] of fetchMock.mock.calls as [string][]) {
        expect(url).toBe(`http://pulp.test${IMPORT_HREF}`);
      }
    });

    it("surfaces an upstream 404 as its status and detail", async () => {
      fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ detail: "Not found." }), { status: 404 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await GET(new Request("http://pulp.test/x"), paramsFor(id, importId));

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ detail: "Not found." });
    });
  });

  describe("DELETE", () => {
    it("deletes the import (Pulp answers 204) and returns ok", async () => {
      const response = await DELETE(
        new Request("http://pulp.test/x", { method: "DELETE" }),
        paramsFor(id, importId)
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://pulp.test${IMPORT_HREF}`);
      expect(init.method).toBe("DELETE");
    });

    it("surfaces an upstream failure as its status and detail", async () => {
      fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ detail: "Not found." }), { status: 404 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await DELETE(
        new Request("http://pulp.test/x", { method: "DELETE" }),
        paramsFor(id, importId)
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ detail: "Not found." });
    });
  });
});
