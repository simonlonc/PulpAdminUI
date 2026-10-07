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

import { GET, POST } from "@/app/api/pulp/exporters/filesystem/route";

const EXPORTER = {
  pulp_href: "/pulp/api/v3/exporters/core/filesystem/abc/",
  name: "aa-test-fs",
  path: "/var/lib/pulp/exports/aa-test-fs",
  method: "write",
};

function postRequest(body: unknown) {
  return new Request("http://pulp.test/api/pulp/exporters/filesystem", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/pulp/exporters/filesystem", () => {
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
          "http://pulp.test/api/pulp/exporters/filesystem?limit=10&offset=20&ordering=-name&name__icontains=aa&q=x&pulp_label_select=env&other=1"
        ),
        undefined
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ count: 0, next: null, previous: null, results: [] });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      const upstream = new URL(url);
      expect(upstream.pathname).toBe("/pulp/api/v3/exporters/core/filesystem/");
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

      const response = await GET(
        new Request("http://pulp.test/api/pulp/exporters/filesystem"),
        undefined
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ detail: "Not found." });
    });
  });

  describe("POST", () => {
    it("rejects a missing name with 400 and never calls Pulp", async () => {
      const response = await POST(postRequest({ path: "/var/lib/pulp/exports/x" }), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Exporter name is required." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a blank name with 400 and never calls Pulp", async () => {
      const response = await POST(
        postRequest({ name: "   ", path: "/var/lib/pulp/exports/x" }),
        undefined
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Exporter name is required." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a missing path with 400 and never calls Pulp", async () => {
      const response = await POST(postRequest({ name: "aa-test-fs" }), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Exporter path is required." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a non-string path with 400 and never calls Pulp", async () => {
      const response = await POST(postRequest({ name: "aa-test-fs", path: 42 }), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Exporter path is required." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a literal null body with 400 instead of throwing a raw TypeError", async () => {
      const response = await POST(postRequest("null"), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Invalid request body." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ["an unknown method", "copy"],
      ["a method in the wrong case", "WRITE"],
      ["a blank method", ""],
      ["a non-string method", 1],
      ["a null method", null],
    ])("rejects %s with 400 and never calls Pulp", async (_label, method) => {
      const response = await POST(
        postRequest({ name: "aa-test-fs", path: "/var/lib/pulp/exports/aa-test-fs", method }),
        undefined
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        detail: "method must be one of write, hardlink or symlink.",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(["write", "hardlink", "symlink"])("accepts the %s method and forwards it", async (method) => {
      fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ ...EXPORTER, method }), { status: 201 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await POST(
        postRequest({ name: "aa-test-fs", path: "/var/lib/pulp/exports/aa-test-fs", method }),
        undefined
      );

      expect(response.status).toBe(200);
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body)).method).toBe(method);
    });

    it("trims name and path, leaves method out when none is given, and returns the created exporter", async () => {
      fetchMock = vi.fn(async () => new Response(JSON.stringify(EXPORTER), { status: 201 }));
      vi.stubGlobal("fetch", fetchMock);

      const response = await POST(
        postRequest({
          name: "  aa-test-fs ",
          path: " /var/lib/pulp/exports/aa-test-fs ",
          repositories: ["/repositories/file/file/one/"],
        }),
        undefined
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(EXPORTER);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("http://pulp.test/pulp/api/v3/exporters/core/filesystem/");
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({
        name: "aa-test-fs",
        path: "/var/lib/pulp/exports/aa-test-fs",
      });
    });

    it("surfaces Pulp's disallowed-export-path 400 with its message, not a 500", async () => {
      fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify({ path: ["Path '/tmp/x' is not an allowed export path"] }), {
            status: 400,
          })
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await POST(postRequest({ name: "aa-test-fs", path: "/tmp/x" }), undefined);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.detail).toContain("Path '/tmp/x' is not an allowed export path");
    });
  });
});
