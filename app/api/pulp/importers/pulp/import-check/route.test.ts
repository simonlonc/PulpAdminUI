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

import { POST } from "@/app/api/pulp/importers/pulp/import-check/route";

const VALID_EVALUATION = {
  toc: { context: "/var/lib/pulp/exports/aa-probe/export-toc.json", is_valid: true, messages: [] },
  repo_mapping: {
    context: '{"aa-probe-src":"aa-probe-dst"}',
    is_valid: true,
    messages: [],
  },
};

function postRequest(body: unknown) {
  return new Request("http://pulp.test/api/pulp/importers/pulp/import-check", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/pulp/importers/pulp/import-check", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    fetchMock = vi.fn(async () => new Response(JSON.stringify(VALID_EVALUATION), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("POST", () => {
    it("JSON-encodes repo_mapping, forwards trimmed path and toc, and returns Pulp's evaluation unchanged", async () => {
      const response = await POST(
        postRequest({
          toc: " /var/lib/pulp/exports/aa-probe/export-toc.json ",
          path: "   ",
          repo_mapping: { " aa-probe-src ": " aa-probe-dst ", "": "x" },
          ignored: "x",
        }),
        undefined
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(VALID_EVALUATION);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("http://pulp.test/pulp/api/v3/importers/core/pulp/import-check/");
      expect(init.method).toBe("POST");
      const forwarded = JSON.parse(String(init.body));
      expect(forwarded).toEqual({
        toc: "/var/lib/pulp/exports/aa-probe/export-toc.json",
        repo_mapping: '{"aa-probe-src":"aa-probe-dst"}',
      });
      expect(typeof forwarded.repo_mapping).toBe("string");
    });

    it("accepts a repo_mapping on its own", async () => {
      await POST(postRequest({ repo_mapping: { a: "b" } }), undefined);

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({ repo_mapping: '{"a":"b"}' });
    });

    it("passes an is_valid: false evaluation through as a 200, not an error", async () => {
      const failing = {
        path: {
          context: "/tmp/nope.tar.gz",
          is_valid: false,
          messages: ["/tmp is not an allowed import path"],
        },
      };
      fetchMock = vi.fn(async () => new Response(JSON.stringify(failing), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const response = await POST(postRequest({ path: "/tmp/nope.tar.gz" }), undefined);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(failing);
    });

    it.each([
      ["an empty body", {}],
      ["blank and non-string values", { path: "  ", toc: 42 }],
      ["a repo_mapping with no pairs left", { repo_mapping: { "": "x", y: "  " } }],
    ])("returns a 400 for %s and never calls Pulp", async (_label, body) => {
      const response = await POST(postRequest(body), undefined);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        detail: "One of path, toc, or repo_mapping must be specified.",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ["a string", '{"a":"b"}'],
      ["a number", 42],
      ["null", null],
      ["an array", ["a"]],
      ["an object with a non-string value", { a: 1 }],
    ])("rejects a repo_mapping that is %s with 400 and never calls Pulp", async (_label, repoMapping) => {
      const response = await POST(
        postRequest({ toc: "/x-toc.json", repo_mapping: repoMapping }),
        undefined
      );

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

    it("surfaces an upstream failure as its status and detail", async () => {
      fetchMock = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              non_field_errors: ["One of 'path', 'toc', or 'repo_mapping' must be specified."],
            }),
            { status: 400 }
          )
      );
      vi.stubGlobal("fetch", fetchMock);

      const response = await POST(postRequest({ path: "/x.tar" }), undefined);

      expect(response.status).toBe(400);
      expect((await response.json()).detail).toContain("must be specified");
    });
  });
});
