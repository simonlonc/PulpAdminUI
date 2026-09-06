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

import { GET, PATCH } from "@/app/api/pulp/tasks/route";

function calledUrl(fetchMock: ReturnType<typeof vi.fn>, index = 0): URL {
  const call = fetchMock.mock.calls[index];
  const input = call[0];
  return new URL(String(input instanceof Request ? input.url : input));
}

describe("GET /api/pulp/tasks", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    deleteCookieMock.mockClear();
    fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("defaults limit to 100 (not the shared 200 default) and offset to 0", async () => {
    await GET(new Request("http://pulp.test/api/pulp/tasks"));

    const url = calledUrl(fetchMock);
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("offset")).toBe("0");
  });

  it("caps a requested limit above 500 down to 500", async () => {
    await GET(new Request("http://pulp.test/api/pulp/tasks?limit=10000"));

    expect(calledUrl(fetchMock).searchParams.get("limit")).toBe("500");
  });

  it("forwards a requested limit under the cap unchanged", async () => {
    await GET(new Request("http://pulp.test/api/pulp/tasks?limit=25"));

    expect(calledUrl(fetchMock).searchParams.get("limit")).toBe("25");
  });

  it("forwards task-specific params and drops an unlisted one", async () => {
    await GET(
      new Request(
        "http://pulp.test/api/pulp/tasks?state=failed&name__contains=sync&started_at__gte=2024-01-01&arbitrary=1"
      )
    );

    const url = calledUrl(fetchMock);
    expect(url.searchParams.get("state")).toBe("failed");
    expect(url.searchParams.get("name__contains")).toBe("sync");
    expect(url.searchParams.get("started_at__gte")).toBe("2024-01-01");
    expect(url.searchParams.has("arbitrary")).toBe(false);
  });

  it("deletes the auth cookie when the upstream call returns 401", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Not authenticated." }), { status: 401 })
    );

    const response = await GET(new Request("http://pulp.test/api/pulp/tasks"));

    expect(response.status).toBe(401);
    expect(deleteCookieMock).toHaveBeenCalledWith("pulp_auth");
  });
});

describe("PATCH /api/pulp/tasks", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
    deleteCookieMock.mockClear();
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ state: "canceled" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects an href that is not a task href with 400 and never calls fetch", async () => {
    const request = new Request("http://pulp.test/api/pulp/tasks", {
      method: "PATCH",
      body: JSON.stringify({ pulp_href: "/repositories/rpm/rpm/abc/" }),
    });

    const response = await PATCH(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "Not a task href." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels a task href by PATCHing state=canceled upstream", async () => {
    const request = new Request("http://pulp.test/api/pulp/tasks", {
      method: "PATCH",
      body: JSON.stringify({ pulp_href: "/tasks/abc/" }),
    });

    const response = await PATCH(request);

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toBe("http://pulp.test/pulp/api/v3/tasks/abc/");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ state: "canceled" });
  });

  it("turns a 409 from an already-finished task into a readable detail", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ state: "completed" }), { status: 409 }));
    const request = new Request("http://pulp.test/api/pulp/tasks", {
      method: "PATCH",
      body: JSON.stringify({ pulp_href: "/tasks/abc/" }),
    });

    const response = await PATCH(request);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      detail: "Task is no longer running and cannot be canceled.",
    });
  });

  it("surfaces a field-keyed Pulp 400 body as a readable detail", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ state: ["Invalid state transition."] }), { status: 400 })
    );
    const request = new Request("http://pulp.test/api/pulp/tasks", {
      method: "PATCH",
      body: JSON.stringify({ pulp_href: "/tasks/abc/" }),
    });

    const response = await PATCH(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "state: Invalid state transition." });
  });

  it("deletes the auth cookie when the upstream call returns 403", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Forbidden." }), { status: 403 }));
    const request = new Request("http://pulp.test/api/pulp/tasks", {
      method: "PATCH",
      body: JSON.stringify({ pulp_href: "/tasks/abc/" }),
    });

    const response = await PATCH(request);

    expect(response.status).toBe(403);
    expect(deleteCookieMock).toHaveBeenCalledWith("pulp_auth");
  });
});
