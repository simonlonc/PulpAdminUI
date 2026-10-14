import { afterEach, describe, expect, it, vi } from "vitest";

import { pulpAuthService } from "@/services/pulp/auth-service";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pulpAuthService.login", () => {
  function stubLogin() {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ username: "admin" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const sentBody = (fetchMock: ReturnType<typeof stubLogin>) =>
    JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

  it("puts the chosen backendId in the body", async () => {
    const fetchMock = stubLogin();

    const result = await pulpAuthService.login("admin", "pw", "b");

    expect(result).toEqual({ ok: true, username: "admin" });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/pulp/login");
    expect(sentBody(fetchMock)).toEqual({ username: "admin", password: "pw", backendId: "b" });
  });

  it("leaves backendId out of the body when none is given", async () => {
    const fetchMock = stubLogin();

    await pulpAuthService.login("admin", "pw");

    expect(sentBody(fetchMock)).toEqual({ username: "admin", password: "pw" });
    expect(sentBody(fetchMock)).not.toHaveProperty("backendId");
  });
});

describe("pulpAuthService.listBackends", () => {
  it("returns the route's list", async () => {
    const backends = [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Bravo" },
    ];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(backends), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await pulpAuthService.listBackends()).toEqual(backends);
    expect(fetchMock).toHaveBeenCalledWith("/api/pulp/backends");
  });

  it("returns an empty list on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "The Pulp server list cannot be read." }), {
            status: 500,
          })
      )
    );

    expect(await pulpAuthService.listBackends()).toEqual([]);
  });

  it("returns an empty list on a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );

    expect(await pulpAuthService.listBackends()).toEqual([]);
  });
});
