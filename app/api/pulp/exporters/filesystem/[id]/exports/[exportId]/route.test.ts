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

import { DELETE, GET } from "@/app/api/pulp/exporters/filesystem/[id]/exports/[exportId]/route";

const EXPORTER_HREF = "/pulp/api/v3/exporters/core/filesystem/abc/";
const EXPORT_HREF = `${EXPORTER_HREF}exports/def/`;

function paramsFor(id: string, exportId: string) {
  return { params: Promise.resolve({ id, exportId }) };
}

describe("/api/pulp/exporters/filesystem/[id]/exports/[exportId]", () => {
  const id = encodeURIComponent(EXPORTER_HREF);
  const exportId = encodeURIComponent(EXPORT_HREF);
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

  describe("export identifier validation", () => {
    it.each([
      ["a malformed percent-encoding", "%"],
      ["a different resource", encodeURIComponent("/pulp/api/v3/users/1/")],
      ["an exporter href with no /exports/ in it", encodeURIComponent(EXPORTER_HREF)],
      ["a pulp export", encodeURIComponent("/pulp/api/v3/exporters/core/pulp/abc/exports/def/")],
      [
        "dot-segments walking out of the filesystem exporters tree",
        encodeURIComponent("/pulp/api/v3/exporters/core/filesystem/abc/exports/../../../../users/1/"),
      ],
      [
        "dot-segments walking over into the pulp exporters tree",
        encodeURIComponent("/pulp/api/v3/exporters/core/filesystem/abc/exports/../../../pulp/abc/exports/def/"),
      ],
      ["a bare name", "def"],
      ["an empty string", ""],
    ])("returns a 400 and never calls Pulp for %s", async (_label, badExportId) => {
      for (const handler of [GET, DELETE]) {
        const response = await handler(
          new Request(`http://pulp.test/api/pulp/exporters/filesystem/${id}/exports/${badExportId}`),
          paramsFor(id, badExportId)
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ detail: "Invalid export identifier." });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("GET", () => {
    it("reads the export at its href, whether the id is relative or absolute", async () => {
      fetchMock = vi.fn(
        async () =>
          new Response(
            JSON.stringify({ pulp_href: EXPORT_HREF, exported_resources: [], params: { publication: "p" } }),
            { status: 200 }
          )
      );
      vi.stubGlobal("fetch", fetchMock);

      for (const href of [EXPORT_HREF, `http://pulp.test${EXPORT_HREF}`]) {
        const response = await GET(
          new Request("http://pulp.test/x"),
          paramsFor(id, encodeURIComponent(href))
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          pulp_href: EXPORT_HREF,
          exported_resources: [],
          params: { publication: "p" },
        });
      }
      for (const [url] of fetchMock.mock.calls as [string][]) {
        expect(url).toBe(`http://pulp.test${EXPORT_HREF}`);
      }
    });

    it("surfaces an upstream 404 as its status and detail", async () => {
      fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ detail: "Not found." }), { status: 404 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await GET(new Request("http://pulp.test/x"), paramsFor(id, exportId));

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ detail: "Not found." });
    });
  });

  describe("DELETE", () => {
    it("deletes the export (Pulp answers 204) and returns ok", async () => {
      const response = await DELETE(
        new Request("http://pulp.test/x", { method: "DELETE" }),
        paramsFor(id, exportId)
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://pulp.test${EXPORT_HREF}`);
      expect(init.method).toBe("DELETE");
    });

    it("surfaces an upstream failure as its status and detail", async () => {
      fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ detail: "Not found." }), { status: 404 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await DELETE(
        new Request("http://pulp.test/x", { method: "DELETE" }),
        paramsFor(id, exportId)
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ detail: "Not found." });
    });
  });
});
