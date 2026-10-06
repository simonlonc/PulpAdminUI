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

import { GET, POST } from "@/app/api/pulp/exporters/pulp/route";

const EXPORTER = {
  pulp_href: "/pulp/api/v3/exporters/core/pulp/abc/",
  name: "aa-test",
  path: "/var/lib/pulp/exports/aa-test",
  repositories: [],
  last_export: null,
};

function postRequest(body: unknown) {
  return new Request("http://pulp.test/api/pulp/exporters/pulp", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/pulp/exporters/pulp", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("GET", () => {
    it("forwards the list params and drops pulp_label_select, which Pulp 400s on for exporters", async () => {
      fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), {
            status: 200,
          })
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await GET(
        new Request(
          "http://pulp.test/api/pulp/exporters/pulp?limit=10&offset=20&ordering=-name&name__icontains=aa&q=x&pulp_label_select=env&other=1"
        ),
        undefined
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ count: 0, next: null, previous: null, results: [] });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      const upstream = new URL(url);
      expect(upstream.pathname).toBe("/pulp/api/v3/exporters/core/pulp/");
      expect(Object.fromEntries(upstream.searchParams)).toEqual({
        limit: "10",
        offset: "20",
        ordering: "-name",
        name__icontains: "aa",
        q: "x",
      });
    });

    it("surfaces an upstream failure as its status and detail", async () => {
      fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ detail: "Not found." }), { status: 404 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await GET(new Request("http://pulp.test/api/pulp/exporters/pulp"), undefined);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ detail: "Not found." });
    });
  });

  describe("POST", () => {
    it("rejects a missing name with 400 and never calls Pulp", async () => {
      const response = await POST(postRequest({ path: "/var/lib/pulp/exports/x", repositories: [] }), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Exporter name is required." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a blank name with 400 and never calls Pulp", async () => {
      const response = await POST(
        postRequest({ name: "   ", path: "/var/lib/pulp/exports/x", repositories: [] }),
        undefined
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Exporter name is required." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a missing path with 400 and never calls Pulp", async () => {
      const response = await POST(postRequest({ name: "aa-test", repositories: [] }), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Exporter path is required." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a non-string path with 400 and never calls Pulp", async () => {
      const response = await POST(postRequest({ name: "aa-test", path: 42, repositories: [] }), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Exporter path is required." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a non-array repositories with 400 and never calls Pulp", async () => {
      const response = await POST(
        postRequest({ name: "aa-test", path: "/var/lib/pulp/exports/x", repositories: "nope" }),
        undefined
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "repositories must be an array of strings." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a literal null body with 400 instead of throwing a raw TypeError", async () => {
      const response = await POST(postRequest("null"), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Invalid request body." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("trims name and path, normalizes repository hrefs, and returns the created exporter", async () => {
      fetchMock = vi.fn(async () => new Response(JSON.stringify(EXPORTER), { status: 201 }));
      vi.stubGlobal("fetch", fetchMock);

      const response = await POST(
        postRequest({
          name: "  aa-test ",
          path: " /var/lib/pulp/exports/aa-test ",
          repositories: [
            "http://pulp.test/pulp/api/v3/repositories/file/file/one/",
            "/repositories/file/file/two/",
          ],
        }),
        undefined
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(EXPORTER);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("http://pulp.test/pulp/api/v3/exporters/core/pulp/");
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({
        name: "aa-test",
        path: "/var/lib/pulp/exports/aa-test",
        repositories: [
          "/pulp/api/v3/repositories/file/file/one/",
          "/pulp/api/v3/repositories/file/file/two/",
        ],
      });
    });

    it("sends repositories as an empty list when none is given, since Pulp requires the field", async () => {
      fetchMock = vi.fn(async () => new Response(JSON.stringify(EXPORTER), { status: 201 }));
      vi.stubGlobal("fetch", fetchMock);

      await POST(postRequest({ name: "aa-test", path: "/var/lib/pulp/exports/aa-test" }), undefined);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body)).repositories).toEqual([]);
    });

    it("surfaces Pulp's disallowed-export-path 400 with its message, not a 500", async () => {
      fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify({ path: ["Path '/tmp/x' is not an allowed export path"] }), {
            status: 400,
          })
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await POST(
        postRequest({ name: "aa-test", path: "/tmp/x", repositories: [] }),
        undefined
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.detail).toContain("Path '/tmp/x' is not an allowed export path");
    });
  });
});
