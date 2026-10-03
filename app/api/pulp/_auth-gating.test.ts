import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PulpApiError, withPulpAuth } from "@/app/api/pulp/_helpers";
import { encodePulpAuth } from "@/lib/pulp";

// requirePulpAuth() (app/api/pulp/_helpers.ts) is the first thing every route handler below
// calls, so this file drives it directly by stubbing next/headers' cookies() and asserting the
// resulting 401 responses, without a running Pulp server.
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

const PULP_ROUTES_DIR = join(process.cwd(), "app/api/pulp");

/** login/route.ts and logout/route.ts do not call requirePulpAuth and are excluded here. */
const EXCLUDED_ROUTE_FILES = new Set([
  join(PULP_ROUTES_DIR, "login", "route.ts"),
  join(PULP_ROUTES_DIR, "logout", "route.ts"),
]);

function findRouteFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...findRouteFiles(full));
    } else if (entry === "route.ts") {
      found.push(full);
    }
  }
  return found;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

type RouteModule = Record<string, unknown>;

type RouteEntry = {
  label: string;
  methods: (typeof HTTP_METHODS)[number][];
  mod: RouteModule;
};

// Walking the filesystem and importing each module up front (rather than hand-listing routes)
// means a new route file is picked up automatically, and a route file that fails to import
// fails this file's collection instead of being silently skipped.
const routeFiles = findRouteFiles(PULP_ROUTES_DIR).filter((file) => !EXCLUDED_ROUTE_FILES.has(file));

const routeEntries: RouteEntry[] = [];
for (const file of routeFiles) {
  const importPath = `@/${relative(process.cwd(), file).replace(/\.ts$/, "")}`;
  const mod: RouteModule = await import(importPath);
  const methods = HTTP_METHODS.filter((method) => typeof mod[method] === "function");
  routeEntries.push({ label: relative(PULP_ROUTES_DIR, file), methods, mod });
}

/** kind/id cover every dynamic segment name used under app/api/pulp; unused keys are ignored. */
function dummyContext() {
  return { params: Promise.resolve({ kind: "rpm", id: "1" }) };
}

describe("route discovery", () => {
  it("found route.ts files, excluding only login and logout", () => {
    expect(routeFiles.length).toBeGreaterThan(0);
    expect(routeFiles.some((f) => f.endsWith(`${join("login", "route.ts")}`))).toBe(false);
    expect(routeFiles.some((f) => f.endsWith(`${join("logout", "route.ts")}`))).toBe(false);
  });

  it("every discovered route file exports at least one HTTP method handler", () => {
    for (const entry of routeEntries) {
      expect(entry.methods.length).toBeGreaterThan(0);
    }
  });
});

describe("auth gating for every route handler", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    cookieState.value = undefined;
    deleteCookieMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  for (const entry of routeEntries) {
    describe(entry.label, () => {
      for (const method of entry.methods) {
        it(`${method} returns 401 with no cookie and never calls fetch`, async () => {
          const handler = entry.mod[method] as (
            request: Request,
            context: ReturnType<typeof dummyContext>
          ) => Promise<Response>;

          const response = await handler(new Request("http://pulp.test/x", { method }), dummyContext());

          expect(response.status).toBe(401);
          expect(await response.json()).toEqual({ detail: "Not authenticated." });
          expect(fetchMock).not.toHaveBeenCalled();
        });

        it(`${method} returns 401 with a corrupt cookie, deletes it, and never calls fetch`, async () => {
          cookieState.value = "not-valid-base64url-json";
          const handler = entry.mod[method] as (
            request: Request,
            context: ReturnType<typeof dummyContext>
          ) => Promise<Response>;

          const response = await handler(new Request("http://pulp.test/x", { method }), dummyContext());

          expect(response.status).toBe(401);
          expect(await response.json()).toEqual({ detail: "Invalid session." });
          expect(deleteCookieMock).toHaveBeenCalledWith("pulp_auth");
          expect(fetchMock).not.toHaveBeenCalled();
        });
      }
    });
  }
});

describe("withPulpAuth logging", () => {
  const PASSWORD = "hunter2-recognizable-password";
  let lines: string[] = [];
  let encodedCookie: string;

  beforeEach(() => {
    vi.stubEnv("PULP_SESSION_SECRET", "test-secret-do-not-use-in-production");
    encodedCookie = encodePulpAuth({ username: "admin", password: PASSWORD });
    cookieState.value = encodedCookie;
    deleteCookieMock.mockClear();
    lines = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function expectNoCredentials() {
    const output = lines.join("");
    expect(output).not.toContain(PASSWORD);
    expect(output).not.toContain(encodedCookie);
  }

  it("logs one warn line for a PulpApiError and still returns its JSON", async () => {
    const handler = withPulpAuth(async () => {
      throw new PulpApiError(404, "Repository not found.");
    });

    const response = await handler(new Request("http://pulp.test/api/pulp/x?name=secretish", { method: "GET" }), undefined);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ detail: "Repository not found." });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      level: "warn",
      event: "pulp_route_failed",
      route: "GET /api/pulp/x",
      status: 404,
      detail: "Repository not found.",
    });
    expectNoCredentials();
  });

  it("logs one error line with the stack for any other error and still rethrows it", async () => {
    const failure = new TypeError("Cannot read properties of undefined");
    const handler = withPulpAuth(async () => {
      throw failure;
    });

    await expect(
      handler(new Request("http://pulp.test/api/pulp/x?name=secretish", { method: "POST" }), undefined)
    ).rejects.toBe(failure);

    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0]);
    expect(line).toMatchObject({
      level: "error",
      event: "pulp_route_crashed",
      route: "POST /api/pulp/x",
      message: "Cannot read properties of undefined",
    });
    expect(line.stack).toContain("TypeError: Cannot read properties of undefined");
    expectNoCredentials();
  });

  it("does not log a missing or invalid session", async () => {
    const handler = withPulpAuth(async () => Response.json({}));

    cookieState.value = undefined;
    expect((await handler(new Request("http://pulp.test/x"), undefined)).status).toBe(401);
    cookieState.value = "not-valid-base64url-json";
    expect((await handler(new Request("http://pulp.test/x"), undefined)).status).toBe(401);

    expect(lines).toEqual([]);
  });
});
