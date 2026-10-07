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

import {
  GET,
  POST,
} from "@/app/api/pulp/exporters/pulp/[id]/exports/[exportId]/publish/route";

const EXPORTER_HREF = "/pulp/api/v3/exporters/core/pulp/abc/";
const EXPORT_HREF = `${EXPORTER_HREF}exports/def/`;
const REPOSITORY_HREF = "/pulp/api/v3/repositories/file/file/0192/";
const TASK = "/pulp/api/v3/tasks/0193/";
const TAR = "/var/lib/pulp/exports/aa-probe/export-1.tar";
const TOC = "/var/lib/pulp/exports/aa-probe/export-1-toc.json";
const SHA256 = "c8e8a7ff309aff3d5a23c97ea623cb95de7c362ee59d3aa00b7d65b750632f55";
const EXPORT_ROW = {
  pulp_href: EXPORT_HREF,
  output_file_info: { [TAR]: "2e1a1f6d", [TOC]: SHA256 },
  toc_info: { file: TOC, sha256: SHA256 },
};

function paramsFor(id: string, exportId: string) {
  return { params: Promise.resolve({ id, exportId }) };
}

describe("/api/pulp/exporters/pulp/[id]/exports/[exportId]/publish", () => {
  const id = encodeURIComponent(EXPORTER_HREF);
  const exportId = encodeURIComponent(EXPORT_HREF);
  let fetchMock: ReturnType<typeof vi.fn>;

  function call(handler: typeof GET | typeof POST, body?: unknown, ref = exportId) {
    const method = handler === GET ? "GET" : "POST";
    return handler(
      new Request(`http://pulp.test/api/pulp/exporters/pulp/${id}/exports/${ref}/publish`, {
        method,
        body: body === undefined || method === "GET" ? undefined : JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      }),
      paramsFor(id, ref)
    );
  }

  /** The content-create POSTs sent upstream, as [url, init]. */
  function createCalls() {
    return (fetchMock.mock.calls as [string, RequestInit][]).filter(
      ([, init]) => init?.method === "POST"
    );
  }

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    vi.stubEnv("PULP_EXPORT_HTTP_BASE_URL", undefined);
    vi.stubEnv("PULP_EXPORT_HTTP_PATH_PREFIX", undefined);
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ task: TASK }), { status: 202 })
        : new Response(JSON.stringify(EXPORT_ROW), { status: 200 })
    );
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
      ["a filesystem export", encodeURIComponent("/pulp/api/v3/exporters/core/filesystem/abc/exports/def/")],
      [
        "dot-segments walking out of the exporters tree",
        encodeURIComponent("/pulp/api/v3/exporters/core/pulp/abc/exports/../../../../users/1/"),
      ],
      ["an empty string", ""],
    ])("returns a 400 and never calls Pulp for %s", async (_label, badExportId) => {
      for (const handler of [GET, POST]) {
        const response = await call(handler, {}, badExportId);

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ detail: "Invalid export identifier." });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("GET", () => {
    it("reports every output file unmapped when the export HTTP variables are unset", async () => {
      const response = await call(GET);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        configured: false,
        files: [
          { path: TAR, checksum: "2e1a1f6d", file_url: null },
          { path: TOC, checksum: SHA256, file_url: null },
        ],
      });
      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://pulp.test${EXPORT_HREF}`);
    });

    it("derives each file's url from the export HTTP variables", async () => {
      vi.stubEnv("PULP_EXPORT_HTTP_BASE_URL", "http://host.containers.internal:8099/");
      vi.stubEnv("PULP_EXPORT_HTTP_PATH_PREFIX", "/var/lib/pulp/exports/");

      const response = await call(GET);

      expect(await response.json()).toEqual({
        configured: true,
        files: [
          {
            path: TAR,
            checksum: "2e1a1f6d",
            file_url: "http://host.containers.internal:8099/aa-probe/export-1.tar",
          },
          {
            path: TOC,
            checksum: SHA256,
            file_url: "http://host.containers.internal:8099/aa-probe/export-1-toc.json",
          },
        ],
      });
    });

    it("leaves file_url null for a file outside the mapped directory", async () => {
      vi.stubEnv("PULP_EXPORT_HTTP_BASE_URL", "http://files.test");
      vi.stubEnv("PULP_EXPORT_HTTP_PATH_PREFIX", "/srv/elsewhere");

      const body = await (await call(GET)).json();

      expect(body.configured).toBe(true);
      expect(body.files.map((file: { file_url: string | null }) => file.file_url)).toEqual([null, null]);
    });

    it("is not configured when only one of the variables is set", async () => {
      vi.stubEnv("PULP_EXPORT_HTTP_BASE_URL", "http://files.test");

      const body = await (await call(GET)).json();

      expect(body.configured).toBe(false);
      expect(body.files.map((file: { file_url: string | null }) => file.file_url)).toEqual([null, null]);
    });

    it("returns no files for an export that wrote none", async () => {
      fetchMock.mockImplementation(
        async () =>
          new Response(JSON.stringify({ ...EXPORT_ROW, output_file_info: null, toc_info: {} }), {
            status: 200,
          })
      );

      expect(await (await call(GET)).json()).toEqual({ configured: false, files: [] });
    });

    it("surfaces an upstream 404 as its status and detail", async () => {
      fetchMock.mockImplementation(
        async () => new Response(JSON.stringify({ detail: "Not found." }), { status: 404 })
      );

      const response = await call(GET);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ detail: "Not found." });
    });
  });

  describe("POST", () => {
    const mapped = () => {
      vi.stubEnv("PULP_EXPORT_HTTP_BASE_URL", "http://host.containers.internal:8099");
      vi.stubEnv("PULP_EXPORT_HTTP_PATH_PREFIX", "/var/lib/pulp/exports");
    };

    it("creates the file content with exactly file_url, relative_path and repository", async () => {
      const response = await call(POST, {
        path: TAR,
        repository: REPOSITORY_HREF,
        file_url: " http://files.test/export-1.tar ",
        relative_path: "ignored.tar",
        overwrite: true,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ task: TASK });
      expect(createCalls()).toHaveLength(1);
      const [url, init] = createCalls()[0];
      expect(url).toBe("http://pulp.test/pulp/api/v3/content/file/files/");
      expect(JSON.parse(String(init.body))).toEqual({
        file_url: "http://files.test/export-1.tar",
        relative_path: "export-1.tar",
        repository: REPOSITORY_HREF,
      });
      expect(Object.keys(JSON.parse(String(init.body)))).toEqual([
        "file_url",
        "relative_path",
        "repository",
      ]);
    });

    it("uses the url derived from the export HTTP variables when file_url is omitted", async () => {
      mapped();

      const response = await call(POST, { path: TOC, repository: REPOSITORY_HREF });

      expect(response.status).toBe(200);
      expect(JSON.parse(String(createCalls()[0][1].body))).toEqual({
        file_url: "http://host.containers.internal:8099/aa-probe/export-1-toc.json",
        relative_path: "export-1-toc.json",
        repository: REPOSITORY_HREF,
      });
    });

    it("prefers the client's file_url over the derived one", async () => {
      mapped();

      await call(POST, { path: TAR, repository: REPOSITORY_HREF, file_url: "https://mirror.test/x.tar" });

      expect(JSON.parse(String(createCalls()[0][1].body)).file_url).toBe("https://mirror.test/x.tar");
    });

    it("treats a null file_url as omitted", async () => {
      mapped();

      await call(POST, { path: TAR, repository: REPOSITORY_HREF, file_url: null });

      expect(JSON.parse(String(createCalls()[0][1].body)).file_url).toBe(
        "http://host.containers.internal:8099/aa-probe/export-1.tar"
      );
    });

    it("answers 400 naming both variables and the manual field when there is no url at all", async () => {
      const response = await call(POST, { path: TAR, repository: REPOSITORY_HREF });

      expect(response.status).toBe(400);
      const { detail } = await response.json();
      expect(detail).toContain("PULP_EXPORT_HTTP_BASE_URL");
      expect(detail).toContain("PULP_EXPORT_HTTP_PATH_PREFIX");
      expect(detail).toContain("file_url");
      expect(createCalls()).toEqual([]);
    });

    it("answers 400 when the file is outside the mapped directory and no file_url is given", async () => {
      vi.stubEnv("PULP_EXPORT_HTTP_BASE_URL", "http://files.test");
      vi.stubEnv("PULP_EXPORT_HTTP_PATH_PREFIX", "/srv/elsewhere");

      const response = await call(POST, { path: TAR, repository: REPOSITORY_HREF });

      expect(response.status).toBe(400);
      expect(createCalls()).toEqual([]);
    });

    it.each([
      ["a path the export did not write", "/var/lib/pulp/exports/aa-probe/other.tar"],
      ["a path outside the export directory", "/etc/passwd"],
      ["a basename only", "export-1.tar"],
      ["a traversal that ends at a real file", `${TAR}/../export-1.tar`],
      ["an inherited object key", "constructor"],
      ["an empty path", ""],
      ["a non-string path", 42],
      ["a missing path", undefined],
    ])("rejects %s and creates nothing", async (_label, path) => {
      mapped();

      const response = await call(POST, { path, repository: REPOSITORY_HREF });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "path is not a file of this export." });
      expect(createCalls()).toEqual([]);
    });

    it.each([
      ["a missing repository", undefined],
      ["an empty repository", ""],
      ["a non-string repository", 42],
      ["an RPM repository", "/pulp/api/v3/repositories/rpm/rpm/0192/"],
      ["a File remote", "/pulp/api/v3/remotes/file/file/0192/"],
      ["a File repository version", `${REPOSITORY_HREF}versions/1/`],
      ["a File repository with a query string", `${REPOSITORY_HREF}?x=1`],
      ["the File repository list", "/pulp/api/v3/repositories/file/file/"],
      ["dot-segments walking out of the File repositories", `${REPOSITORY_HREF}../../../../users/1/`],
      ["a malformed href that cannot be parsed", "//"],
    ])("rejects %s and never calls Pulp", async (_label, repository) => {
      mapped();

      const response = await call(POST, { path: TAR, repository });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "repository must be a File repository href." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("accepts a File repository href given as an absolute url or without the API base path", async () => {
      mapped();

      for (const repository of [
        `http://pulp.test${REPOSITORY_HREF}`,
        "/repositories/file/file/0192/",
      ]) {
        fetchMock.mockClear();
        const response = await call(POST, { path: TAR, repository });

        expect(response.status).toBe(200);
        expect(JSON.parse(String(createCalls()[0][1].body)).repository).toBe(REPOSITORY_HREF);
      }
    });

    it.each([
      ["a non-http(s) scheme", "ftp://files.test/export-1.tar"],
      ["a file url", "file:///var/lib/pulp/exports/export-1.tar"],
      ["text that is not a url", "not a url"],
      ["a relative path", "/export-1.tar"],
      ["an empty string", ""],
      ["blank text", "   "],
      ["a number", 42],
      ["an object", { href: "http://files.test/x" }],
    ])("rejects a file_url that is %s and never calls Pulp", async (_label, fileUrl) => {
      mapped();

      const response = await call(POST, { path: TAR, repository: REPOSITORY_HREF, file_url: fileUrl });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "file_url must be an http(s) URL." });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("answers 400 for a body that is not a JSON object", async () => {
      for (const body of ["not json", "null", "42"]) {
        const response = await POST(
          new Request("http://pulp.test/x", { method: "POST", body }),
          paramsFor(id, exportId)
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ detail: "Invalid request body." });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("surfaces a failed read of the export as its status and detail, creating nothing", async () => {
      mapped();
      fetchMock.mockImplementation(
        async () => new Response(JSON.stringify({ detail: "Not found." }), { status: 404 })
      );

      const response = await call(POST, { path: TAR, repository: REPOSITORY_HREF });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ detail: "Not found." });
      expect(createCalls()).toEqual([]);
    });

    it("surfaces Pulp's own rejection of the content unit verbatim", async () => {
      mapped();
      fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
        init?.method === "POST"
          ? new Response(JSON.stringify({ repository: ["Invalid hyperlink - Object does not exist."] }), {
              status: 400,
            })
          : new Response(JSON.stringify(EXPORT_ROW), { status: 200 })
      );

      const response = await call(POST, { path: TAR, repository: REPOSITORY_HREF });

      expect(response.status).toBe(400);
      expect((await response.json()).detail).toContain("Invalid hyperlink - Object does not exist.");
    });
  });
});
