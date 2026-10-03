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

import { DELETE, GET, PATCH } from "@/app/api/pulp/distributions/[id]/route";

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/pulp/distributions/[id]", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const distributionId = encodeURIComponent("/pulp/api/v3/distributions/rpm/rpm/abc/");

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    deleteCookieMock.mockClear();
    fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            pulp_href: "/pulp/api/v3/distributions/rpm/rpm/abc/",
            pulp_created: "2024-01-01T00:00:00Z",
            base_path: "my-repo",
            base_url: "http://lenovo-ideapad-gaming-3:8080/pulp/content/my-repo/",
            content_guard: null,
            pulp_labels: {},
            name: "my-repo",
            repository: null,
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
    const request = new Request(`http://pulp.test/api/pulp/distributions/${distributionId}`);

    const response = await GET(request, paramsFor(distributionId));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.base_url).toBe("http://lenovo-ideapad-gaming-3:8080/pulp/content/my-repo/");
  });

  it("replaces the origin while preserving the content path when PULP_CONTENT_ORIGIN is set", async () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "https://pulp.example.com");
    const request = new Request(`http://pulp.test/api/pulp/distributions/${distributionId}`);

    const response = await GET(request, paramsFor(distributionId));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.base_url).toBe("https://pulp.example.com/pulp/content/my-repo/");
  });
});

describe("decodeURIComponent guard for /api/pulp/distributions/[id] (F-17)", () => {
  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    deleteCookieMock.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 }))
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns a 400 with a detail instead of throwing for GET when id is '%'", async () => {
    const request = new Request("http://pulp.test/api/pulp/distributions/%");

    const response = await GET(request, paramsFor("%"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("returns a 400 with a detail instead of throwing for PATCH when id is '%'", async () => {
    const request = new Request("http://pulp.test/api/pulp/distributions/%", {
      method: "PATCH",
      body: JSON.stringify({ name: "new-name" }),
    });

    const response = await PATCH(request, paramsFor("%"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("returns a 400 with a detail instead of throwing for DELETE when id is '%'", async () => {
    const request = new Request("http://pulp.test/api/pulp/distributions/%", {
      method: "DELETE",
    });

    const response = await DELETE(request, paramsFor("%"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });
});

describe("PATCH /api/pulp/distributions/[id] null body (F-18)", () => {
  const distributionId = encodeURIComponent("/pulp/api/v3/distributions/rpm/rpm/abc/");

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    deleteCookieMock.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }))
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects a literal null body with 400 instead of throwing a raw TypeError", async () => {
    const request = new Request(`http://pulp.test/api/pulp/distributions/${distributionId}`, {
      method: "PATCH",
      body: "null",
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(request, paramsFor(distributionId));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "Invalid request body." });
  });
});

describe("PATCH /api/pulp/distributions/[id] hidden", () => {
  const distributionId = encodeURIComponent("/pulp/api/v3/distributions/rpm/rpm/abc/");
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ task: "/pulp/api/v3/tasks/t/" }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function patch(body: Record<string, unknown>) {
    return PATCH(
      new Request(`http://pulp.test/api/pulp/distributions/${distributionId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
      paramsFor(distributionId)
    );
  }

  it("forwards hidden true and false, since false is a real change", async () => {
    await patch({ hidden: true });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ hidden: true });
    await patch({ hidden: false });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({ hidden: false });
  });

  it("rejects a non-boolean hidden with a 400 and never calls Pulp", async () => {
    const response = await patch({ hidden: "yes" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "hidden must be true or false." });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/pulp/distributions/[id] repository_version", () => {
  const distributionId = encodeURIComponent("/pulp/api/v3/distributions/file/file/abc/");
  const VERSION = "/pulp/api/v3/repositories/file/file/r1/versions/1/";
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ task: "/pulp/api/v3/tasks/t/" }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function patch(body: Record<string, unknown>) {
    return PATCH(
      new Request(`http://pulp.test/api/pulp/distributions/${distributionId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
      paramsFor(distributionId)
    );
  }

  const sent = () => JSON.parse(String(fetchMock.mock.calls[0][1].body));

  it("pins a version and clears the repository and publication in the same PATCH", async () => {
    await patch({ repository: null, publication: null, repository_version: VERSION });
    expect(sent()).toEqual({ repository: null, publication: null, repository_version: VERSION });
  });

  it("switching back to a repository clears the version", async () => {
    const repository = "/pulp/api/v3/repositories/file/file/r1/";
    await patch({ repository, publication: null, repository_version: null });
    expect(sent()).toEqual({ repository, publication: null, repository_version: null });
  });

  it("rejects a version set together with a repository or a publication, never calling Pulp", async () => {
    for (const other of [{ repository: "/pulp/api/v3/repositories/file/file/r1/" }, { publication: "/p/" }]) {
      const response = await patch({ repository_version: VERSION, ...other });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        detail: "Only one of repository, publication and repository_version may be set.",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an href that is not a repository version", async () => {
    for (const bad of ["/pulp/api/v3/repositories/file/file/r1/", "/pulp/api/v3/repositories/file/file/r1/versions/", 7]) {
      const response = await patch({ repository_version: bad });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: "repository_version must be a repository version href." });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
