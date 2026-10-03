import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodePulpAuth } from "@/lib/pulp";

const { cookieState, deleteCookieMock } = vi.hoisted(() => ({
  cookieState: { value: undefined as string | undefined },
  deleteCookieMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieState.value === undefined ? undefined : { name, value: cookieState.value },
    delete: (name: string) => {
      deleteCookieMock(name);
      cookieState.value = undefined;
    },
    set: () => {},
  }),
}));

import { GET, POST } from "@/app/api/pulp/distributions/route";

describe("GET /api/pulp/distributions", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    deleteCookieMock.mockClear();
    fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            count: 1,
            next: null,
            previous: null,
            results: [
              {
                pulp_href: "/pulp/api/v3/distributions/rpm/rpm/abc/",
                pulp_created: "2024-01-01T00:00:00Z",
                base_path: "my-repo",
                base_url: "http://lenovo-ideapad-gaming-3:8080/pulp/content/my-repo/",
                content_guard: null,
                pulp_labels: {},
                name: "my-repo",
                repository: null,
              },
            ],
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("leaves base_url identical to Pulp's when PULP_CONTENT_ORIGIN is unset", async () => {
    const response = await GET(new Request("http://pulp.test/api/pulp/distributions"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results[0].base_url).toBe(
      "http://lenovo-ideapad-gaming-3:8080/pulp/content/my-repo/"
    );
    expect(body.count).toBe(1);
  });

  it("replaces the origin while preserving the content path when PULP_CONTENT_ORIGIN is set", async () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "https://pulp.example.com");

    const response = await GET(new Request("http://pulp.test/api/pulp/distributions"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results[0].base_url).toBe("https://pulp.example.com/pulp/content/my-repo/");
  });
});

describe("GET /api/pulp/distributions response-shape guard (F-16)", () => {
  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    deleteCookieMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns a 502 with a detail, not a TypeError, when Pulp's 200 body is a bare number", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("42", { status: 200 })));

    const response = await GET(new Request("http://pulp.test/api/pulp/distributions"));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("returns a 502 with a detail, not a TypeError, when Pulp's 200 body has no results array", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));

    const response = await GET(new Request("http://pulp.test/api/pulp/distributions"));

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });
});

describe("POST /api/pulp/distributions null body (F-18)", () => {
  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    deleteCookieMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects a literal null body with 400 instead of throwing a raw TypeError", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("http://pulp.test/api/pulp/distributions", {
      method: "POST",
      body: "null",
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, undefined);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "Invalid request body." });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/pulp/distributions hidden", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/docs/api.json")
        ? new Response("", { status: 500 })
        : new Response(JSON.stringify({ task: "/pulp/api/v3/tasks/t/" }), { status: 202 })
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function create(extra: Record<string, unknown>) {
    return POST(
      new Request("http://pulp.test/api/pulp/distributions", {
        method: "POST",
        body: JSON.stringify({ kind: "file", name: "d", base_path: "d", ...extra }),
      })
    );
  }

  function sentBody(): Record<string, unknown> {
    const call = fetchMock.mock.calls.findLast(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    if (!call) throw new Error("no POST reached Pulp");
    return JSON.parse(String((call[1] as RequestInit).body));
  }

  it("sends hidden when given, true or false", async () => {
    await create({ hidden: true });
    expect(sentBody().hidden).toBe(true);
    await create({ hidden: false });
    expect(sentBody().hidden).toBe(false);
  });

  it("leaves hidden out when absent, so Pulp applies its own default", async () => {
    await create({});
    expect("hidden" in sentBody()).toBe(false);
  });

  it("rejects a non-boolean hidden with a 400", async () => {
    const response = await create({ hidden: "true" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "hidden must be true or false." });
  });
});

describe("POST /api/pulp/distributions repository_version", () => {
  const VERSION = "/pulp/api/v3/repositories/file/file/r1/versions/1/";
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("/docs/api.json")
        ? new Response("", { status: 500 })
        : new Response(JSON.stringify({ task: "/pulp/api/v3/tasks/t/" }), { status: 202 })
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function create(extra: Record<string, unknown>) {
    return POST(
      new Request("http://pulp.test/api/pulp/distributions", {
        method: "POST",
        body: JSON.stringify({ kind: "file", name: "d", base_path: "d", ...extra }),
      })
    );
  }

  function postCalls() {
    return fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
  }

  it("sends a repository version href alone", async () => {
    const response = await create({ repository_version: VERSION, repository: null, publication: null });
    expect(response.status).toBe(200);
    const body = JSON.parse(String((postCalls()[0][1] as RequestInit).body));
    expect(body.repository_version).toBe(VERSION);
    expect("repository" in body).toBe(false);
    expect("publication" in body).toBe(false);
  });

  it("rejects a repository version combined with a repository or a publication", async () => {
    for (const other of [{ repository: "/pulp/api/v3/repositories/file/file/r1/" }, { publication: "/p/" }]) {
      const response = await create({ repository_version: VERSION, ...other });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        detail: "Only one of repository, publication and repository_version may be set.",
      });
    }
    expect(postCalls()).toHaveLength(0);
  });

  it("rejects an href that is not a repository version", async () => {
    for (const bad of [
      "/pulp/api/v3/repositories/file/file/r1/",
      "/pulp/api/v3/publications/file/file/p1/",
      "/pulp/api/v3/repositories/file/file/r1/versions/",
      "not-an-href",
      5,
    ]) {
      const response = await create({ repository_version: bad });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "repository_version must be a repository version href." });
    }
    expect(postCalls()).toHaveLength(0);
  });
});
