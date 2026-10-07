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

import { GET, POST } from "@/app/api/pulp/importers/pulp/route";

const IMPORTER = {
  pulp_href: "/pulp/api/v3/importers/core/pulp/abc/",
  name: "aa-test",
  repo_mapping: { "aa-probe-src": "aa-probe-dst" },
};

function postRequest(body: unknown) {
  return new Request("http://pulp.test/api/pulp/importers/pulp", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/pulp/importers/pulp", () => {
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
    it("forwards the list params and drops pulp_label_select, which Pulp 400s on for importers", async () => {
      fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), {
            status: 200,
          })
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await GET(
        new Request(
          "http://pulp.test/api/pulp/importers/pulp?limit=10&offset=20&ordering=-name&name__icontains=aa&q=x&pulp_label_select=env&other=1"
        ),
        undefined
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ count: 0, next: null, previous: null, results: [] });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      const upstream = new URL(url);
      expect(upstream.pathname).toBe("/pulp/api/v3/importers/core/pulp/");
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

      const response = await GET(new Request("http://pulp.test/api/pulp/importers/pulp"), undefined);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ detail: "Not found." });
    });
  });

  describe("POST", () => {
    it("rejects a missing name with 400 and never calls Pulp", async () => {
      const response = await POST(postRequest({ repo_mapping: {} }), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Importer name is required." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a blank name with 400 and never calls Pulp", async () => {
      const response = await POST(postRequest({ name: "   " }), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Importer name is required." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ["a string", "a=b"],
      ["a number", 42],
      ["null", null],
      ["an array", [["a", "b"]]],
      ["an object with a non-string value", { "aa-probe-src": 1 }],
      ["an object with a null value", { "aa-probe-src": null }],
      ["an object with a nested object value", { "aa-probe-src": { name: "aa-probe-dst" } }],
    ])("rejects a repo_mapping that is %s with 400 and never calls Pulp", async (_label, repoMapping) => {
      const response = await POST(postRequest({ name: "aa-test", repo_mapping: repoMapping }), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "repo_mapping must be an object of repository names." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a literal null body with 400 instead of throwing a raw TypeError", async () => {
      const response = await POST(postRequest("null"), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "Invalid request body." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("trims name and repo_mapping, drops empty pairs, and returns the created importer", async () => {
      fetchMock = vi.fn(async () => new Response(JSON.stringify(IMPORTER), { status: 201 }));
      vi.stubGlobal("fetch", fetchMock);

      const response = await POST(
        postRequest({
          name: "  aa-test ",
          repo_mapping: {
            " aa-probe-src ": " aa-probe-dst ",
            "": "orphan-value",
            "orphan-key": "   ",
          },
          ignored: "x",
        }),
        undefined
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(IMPORTER);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("http://pulp.test/pulp/api/v3/importers/core/pulp/");
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({
        name: "aa-test",
        repo_mapping: { "aa-probe-src": "aa-probe-dst" },
      });
    });

    it("leaves repo_mapping out when none is given", async () => {
      fetchMock = vi.fn(async () => new Response(JSON.stringify(IMPORTER), { status: 201 }));
      vi.stubGlobal("fetch", fetchMock);

      await POST(postRequest({ name: "aa-test" }), undefined);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({ name: "aa-test" });
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

      const response = await POST(
        postRequest({ name: "aa-test", repo_mapping: { "aa-probe-src": "aa-probe-dst" } }),
        undefined
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        detail: "Failed to find repositories from repo_mapping: names: ['aa-probe-dst']",
      });
    });
  });
});
