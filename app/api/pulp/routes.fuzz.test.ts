/// <reference types="vite/client" />
/**
 * Fuzz properties that drive every discovered Pulp API route handler
 * (app/api/pulp/**\/route.ts) through a stubbed `fetch` -- no network, no real
 * Pulp server (mirrors the Epic K3 route-test pattern:
 * `vi.stubGlobal("fetch", ...)` + `vi.mock("next/headers")`).
 *
 * Handlers are discovered with `import.meta.glob`, not hand-listed, so a new
 * route automatically gets both invariants below for free.
 *
 * Invariant 1: a handler never throws -- whatever comes back is a `Response`.
 * Invariant 2: any response with `status >= 400` has a JSON body with a
 * non-empty string `detail` property.
 *
 * Two known finding families are seeded deterministically via `examples` so
 * they fail without relying on random search:
 *
 * F-1 (currently broken): ~20 routes hand a client-supplied `pulp_href` (or a
 * same-shaped field: repository/publication/content_guard/remote/base_version/
 * content/guards/ref) to normalizePulpHrefToApiPath/toPulpHrefPath
 * (app/api/pulp/repositories/_server.ts) or straight into `new URL()`
 * (lib/pulp-resource-ref.ts's parsePulpResourceRef, only for the fallback
 * branch where `new URL()` itself already threw and normalizePulpHrefToApiPath
 * gets the raw string next). withPulpAuth (app/api/pulp/_helpers.ts:70)
 * rethrows anything that is not a PulpApiError, so the malformed-authority
 * `new URL()` throw inside those helpers escapes as a raw 500 with no `detail`.
 *
 * F-2 (currently broken): 18 confirmed `await request.json()` call sites (of
 * 35 total; the rest already guard with try/catch or `.catch(() => ({}))`,
 * and legitimately pass this property) throw a SyntaxError on malformed JSON,
 * or a TypeError on valid-but-wrong-shaped JSON (`null` -- `body.pulp_href` on
 * a bare null throws before the `?.` ever runs), straight out of the
 * unguarded handler. Recorded repro: POST /api/pulp/labels with body `"{"`.
 *
 * Bonus finding, not part of the F-1/F-2 catalog but real and reproducible:
 * app/api/pulp/uploads/route.ts:93 always calls `request.formData()`, which
 * throws a TypeError for any request whose Content-Type is not multipart or
 * url-encoded -- so this route fails Invariant 1 for every JSON-shaped body
 * this harness (and any of this route's real callers who mis-set
 * Content-Type) can produce.
 *
 * This tier only runs under `npm run fuzz` (see vitest.fuzz.config.ts); it is
 * excluded from `npm test`.
 */

import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pulpHref } from "@/test/fuzz/arbitraries";
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
    set: (name: string, value: string) => {
      cookieState.value = value;
    },
  }),
}));

// dashboard-summary/route.ts reads getCachedPulpDashboardStats, which wraps its loader in
// unstable_cache; that throws "Invariant: incrementalCache missing" outside a real Next.js
// request scope. Mirrors the precedent in lib/pulp-dashboard-stats.test.ts: make it a passthrough.
vi.mock("next/cache", () => ({
  unstable_cache:
    <Args extends unknown[], Result>(fn: (...args: Args) => Promise<Result>) =>
    (...args: Args) =>
      fn(...args),
}));

type RouteContext = { params: Promise<Record<string, string>> };
type RouteHandler = (request: Request, context: RouteContext) => Promise<Response>;

const HTTP_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

type DrivenHandler = {
  file: string;
  method: HttpMethod;
  fn: RouteHandler;
};

const routeModules = import.meta.glob<Record<string, unknown>>("/app/api/**/route.ts", {
  eager: true,
});

const drivenHandlers: DrivenHandler[] = [];
const skippedExports: string[] = [];

for (const [file, mod] of Object.entries(routeModules)) {
  for (const method of HTTP_METHODS) {
    const candidate = mod[method];
    if (candidate === undefined) {
      continue;
    }
    if (typeof candidate === "function") {
      drivenHandlers.push({ file, method, fn: candidate as RouteHandler });
    } else {
      skippedExports.push(`${method} ${file}`);
    }
  }
}

// --- Arbitraries -----------------------------------------------------------

function kindArb(): fc.Arbitrary<string> {
  // "rpm" resolves against the curated PULP_PLUGINS fallback (lib/pulp-plugins.ts) that
  // getPulpPluginRegistry falls back to whenever /docs/api.json isn't a real OpenAPI doc (as in
  // our stub), so seeding it lets [kind]-scoped routes clear their plugin-resolution gate.
  return fc.oneof(fc.constantFrom("rpm", "deb", "file", "unknown-kind", ""), fc.string());
}

function idArb(): fc.Arbitrary<string> {
  return fc.oneof(fc.uuid(), fc.webSegment(), fc.string(), fc.constant(""));
}

function queryValueArb(): fc.Arbitrary<string> {
  return fc.oneof(fc.string(), pulpHref(), fc.constant(""));
}

/** A handful of known query param names plus arbitrary ones, valued with strings/hrefs. */
function queryParamsArb(): fc.Arbitrary<Record<string, string>> {
  return fc.dictionary(
    fc.oneof(
      fc.constantFrom(
        "pulp_href",
        "search",
        "ref",
        "limit",
        "offset",
        "q",
        "name__icontains",
        "ordering",
        "for_object_type",
        "repository",
        "content_path",
        "path",
        "id",
        "kind"
      ),
      fc.string({ minLength: 1 })
    ),
    queryValueArb(),
    { maxKeys: 6 }
  );
}

function hrefishValueArb(): fc.Arbitrary<unknown> {
  return fc.oneof(pulpHref(), fc.string(), fc.constant(null), fc.constant(undefined));
}

/**
 * A kitchen-sink body carrying every field name any route reads, all optional -- covers
 * pulp_href-taking routes (labels, object-roles, repositories/[kind]/*, remotes/[kind],
 * distributions, tasks, contentguards, repositories/rpm/add-content) without per-route mapping.
 */
function kitchenSinkBodyArb(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record(
    {
      pulp_href: hrefishValueArb(),
      key: fc.oneof(fc.string(), fc.constant(undefined)),
      value: fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
      role: fc.oneof(fc.string(), fc.constant(undefined)),
      users: fc.oneof(fc.array(fc.string()), fc.constant(undefined)),
      groups: fc.oneof(fc.array(fc.string()), fc.constant(undefined)),
      name: fc.oneof(fc.string(), fc.constant(undefined)),
      base_path: fc.oneof(fc.string(), fc.constant(undefined)),
      repository: hrefishValueArb(),
      publication: hrefishValueArb(),
      content_guard: hrefishValueArb(),
      remote: hrefishValueArb(),
      fields: fc.oneof(fc.dictionary(fc.string(), fc.jsonValue()), fc.constant(undefined)),
      add_content_units: fc.oneof(fc.array(hrefishValueArb()), fc.constant(undefined)),
      remove_content_units: fc.oneof(fc.array(hrefishValueArb()), fc.constant(undefined)),
      base_version: hrefishValueArb(),
      overwrite: fc.oneof(fc.boolean(), fc.constant(undefined)),
      verify_checksums: fc.oneof(fc.boolean(), fc.constant(undefined)),
      username: fc.oneof(fc.string(), fc.constant(undefined)),
      password: fc.oneof(fc.string(), fc.constant(undefined)),
      first_name: fc.oneof(fc.string(), fc.constant(undefined)),
      last_name: fc.oneof(fc.string(), fc.constant(undefined)),
      email: fc.oneof(fc.string(), fc.constant(undefined)),
      is_staff: fc.oneof(fc.boolean(), fc.constant(undefined)),
      is_active: fc.oneof(fc.boolean(), fc.constant(undefined)),
      permissions: fc.oneof(fc.array(fc.string()), fc.constant(undefined)),
      description: fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
      kind: fc.oneof(fc.constantFrom("rpm", "deb", "file", "core.composite"), fc.string(), fc.constant(undefined)),
      guards: fc.oneof(fc.array(hrefishValueArb()), fc.constant(undefined)),
      content: hrefishValueArb(),
      repositoryName: fc.oneof(fc.string(), fc.constant(undefined)),
      artifact: fc.oneof(fc.string(), fc.constant(undefined)),
      pulp_labels: fc.oneof(fc.dictionary(fc.string(), fc.string()), fc.constant(undefined)),
      retain_repo_versions: fc.oneof(fc.integer(), fc.string(), fc.constant(null), fc.constant(undefined)),
      header_name: fc.oneof(fc.string(), fc.constant(undefined)),
      header_value: fc.oneof(fc.string(), fc.constant(undefined)),
      ca_certificate: fc.oneof(fc.string(), fc.constant(undefined)),
    },
    { requiredKeys: [] }
  );
}

/** JSON body text: valid kitchen-sink, malformed JSON, valid-but-wrong-shaped JSON, and empty. */
function bodyTextArb(): fc.Arbitrary<string> {
  return fc.oneof(
    { weight: 3, arbitrary: kitchenSinkBodyArb().map((o) => JSON.stringify(o)) },
    {
      weight: 1,
      arbitrary: fc.constantFrom("{", '{"a":', "[", "not json", "", '{"a":1,}', " "),
    },
    {
      weight: 1,
      arbitrary: fc.constantFrom("null", "42", '"just a string"', "[]", "true"),
    },
    { weight: 1, arbitrary: fc.string() }
  );
}

// --- Harness -----------------------------------------------------------------

async function driveHandler(
  fn: RouteHandler,
  opts: { method: HttpMethod; query: Record<string, string>; body: string; kind: string; id: string }
): Promise<Response> {
  const qs = new URLSearchParams(opts.query).toString();
  const url = `http://x/y${qs ? `?${qs}` : ""}`;
  const init: RequestInit = { method: opts.method };
  if (opts.method !== "GET") {
    init.body = opts.body;
  }
  const request = new Request(url, init);
  const context: RouteContext = { params: Promise.resolve({ kind: opts.kind, id: opts.id }) };
  return fn(request, context);
}

/** A response body Pulp's own endpoints, and this harness's default stub, always shape like. */
const DEFAULT_STUB_HREF = "/pulp/api/v3/repositories/rpm/rpm/00000000-0000-0000-0000-000000000000/";
const DEFAULT_STUB_BODY = {
  count: 0,
  next: null,
  previous: null,
  results: [],
  roles: [],
  permissions: [],
  state: "completed",
  created_resources: [],
  // A safe, well-formed pulp_href/href so routes that chain a second call off the first
  // response's href (e.g. repositories/rpm/add-content's findOrCreateRepository) can proceed
  // past their "no href in response" short-circuit -- deliberately never the fuzzed input.
  pulp_href: DEFAULT_STUB_HREF,
  href: DEFAULT_STUB_HREF,
  name: "stub",
  // Never truthy: both call sites in the codebase only invoke waitForTask (60 attempts x 5s
  // sleep) when this is truthy, so leaving it falsy avoids a multi-minute hang in every run.
  task: null,
};

// A malformed authority that makes `new URL()` throw (h:8080; is not a valid port).
const F1_SEED_HREF = "http://h:8080;/pulp/api/v3/repositories/rpm/rpm/x/";
const F2_SEED_BODY = "{"; // Task's own recorded repro: POST /api/pulp/labels with body "{".

/** A seeded (kind, id, query, body) tuple for fc.assert's `examples` option. */
type SeedTuple = [string, string, Record<string, string>, string];

function seed(kind: string, query: Record<string, string>, body: Record<string, unknown>): SeedTuple {
  return [kind, "seed-id", query, JSON.stringify(body)];
}

/**
 * F-1 seeds: routes confirmed (by reading them) to hand an attacker-controlled pulp_href-shaped
 * field to normalizePulpHrefToApiPath/toPulpHrefPath, or (resolve/route.ts) to
 * parsePulpResourceRef's fallback branch, unguarded. Keyed by "METHOD file-suffix".
 */
const F1_SEEDS: Record<string, SeedTuple[]> = {
  "POST /app/api/pulp/labels/route.ts": [seed("rpm", {}, { pulp_href: F1_SEED_HREF, key: "k" })],
  "DELETE /app/api/pulp/labels/route.ts": [seed("rpm", {}, { pulp_href: F1_SEED_HREF, key: "k" })],
  "GET /app/api/pulp/object-roles/route.ts": [seed("rpm", { pulp_href: F1_SEED_HREF }, {})],
  "POST /app/api/pulp/object-roles/route.ts": [seed("rpm", {}, { pulp_href: F1_SEED_HREF, role: "r" })],
  "DELETE /app/api/pulp/object-roles/route.ts": [seed("rpm", {}, { pulp_href: F1_SEED_HREF, role: "r" })],
  "PATCH /app/api/pulp/repositories/[kind]/route.ts": [
    seed("rpm", {}, { pulp_href: F1_SEED_HREF, name: "n" }),
  ],
  "DELETE /app/api/pulp/repositories/[kind]/route.ts": [seed("rpm", {}, { pulp_href: F1_SEED_HREF })],
  "POST /app/api/pulp/repositories/[kind]/publish/route.ts": [
    seed("rpm", {}, { pulp_href: F1_SEED_HREF }),
  ],
  "POST /app/api/pulp/repositories/[kind]/sync/route.ts": [
    seed("rpm", {}, { pulp_href: F1_SEED_HREF, remote: "x" }),
  ],
  "POST /app/api/pulp/repositories/[kind]/modify/route.ts": [
    seed("rpm", {}, { pulp_href: F1_SEED_HREF }),
  ],
  "POST /app/api/pulp/repositories/[kind]/version/repair/route.ts": [
    seed("rpm", {}, { pulp_href: F1_SEED_HREF }),
  ],
  "GET /app/api/pulp/repositories/[kind]/version/route.ts": [
    seed("rpm", { pulp_href: F1_SEED_HREF }, {}),
  ],
  "DELETE /app/api/pulp/repositories/[kind]/version/route.ts": [
    seed("rpm", {}, { pulp_href: F1_SEED_HREF }),
  ],
  "GET /app/api/pulp/repositories/[kind]/versions/route.ts": [
    seed("rpm", { pulp_href: F1_SEED_HREF }, {}),
  ],
  "POST /app/api/pulp/repositories/rpm/add-content/route.ts": [
    seed("rpm", {}, { repositoryName: "n", content: F1_SEED_HREF }),
  ],
  "POST /app/api/pulp/distributions/route.ts": [
    seed("rpm", {}, { name: "n", base_path: "bp", repository: F1_SEED_HREF }),
  ],
  "POST /app/api/pulp/distributions/create/[kind]/route.ts": [
    seed("rpm", {}, { repository: F1_SEED_HREF, name: "n", base_path: "bp" }),
  ],
  "PATCH /app/api/pulp/remotes/[kind]/route.ts": [seed("rpm", {}, { pulp_href: F1_SEED_HREF })],
  "DELETE /app/api/pulp/remotes/[kind]/route.ts": [seed("rpm", {}, { pulp_href: F1_SEED_HREF })],
  "PATCH /app/api/pulp/tasks/route.ts": [seed("rpm", {}, { pulp_href: F1_SEED_HREF })],
  "POST /app/api/pulp/contentguards/route.ts": [
    seed("rpm", {}, { kind: "core.composite", name: "n", guards: [F1_SEED_HREF] }),
  ],
  "GET /app/api/pulp/resolve/route.ts": [seed("rpm", { ref: F1_SEED_HREF }, {})],
  "GET /app/api/pulp/repositories/detail/route.ts": [seed("rpm", { pulp_href: F1_SEED_HREF }, {})],
  "GET /app/api/pulp/repositories/content/route.ts": [seed("rpm", { pulp_href: F1_SEED_HREF }, {})],
};

/**
 * F-2 seeds: confirmed unguarded `await request.json()` call sites (no surrounding try/catch or
 * `.catch(...)`), driven with the task's own recorded repro body `"{"`. kind: "rpm" clears the
 * plugin-resolution gate that runs before the json() call on [kind]-scoped routes.
 */
const F2_SEEDS: Record<string, SeedTuple[]> = {
  "POST /app/api/pulp/repositories/rpm/add-content/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
  "POST /app/api/pulp/repositories/[kind]/publish/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
  "DELETE /app/api/pulp/repositories/[kind]/version/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
  "POST /app/api/pulp/repositories/[kind]/version/repair/route.ts": [
    ["rpm", "seed-id", {}, F2_SEED_BODY],
  ],
  "POST /app/api/pulp/repositories/[kind]/sync/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
  "PATCH /app/api/pulp/tasks/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
  "POST /app/api/pulp/repositories/[kind]/create/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
  "PATCH /app/api/pulp/repositories/[kind]/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
  "DELETE /app/api/pulp/repositories/[kind]/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
  "POST /app/api/pulp/repositories/[kind]/modify/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
  "POST /app/api/pulp/distributions/create/[kind]/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
  "POST /app/api/pulp/content/rpm/packages/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
  "POST /app/api/pulp/labels/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
  "DELETE /app/api/pulp/labels/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
  "POST /app/api/pulp/remotes/[kind]/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
  "PATCH /app/api/pulp/remotes/[kind]/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
  "DELETE /app/api/pulp/remotes/[kind]/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
  "POST /app/api/pulp/object-roles/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
  "DELETE /app/api/pulp/object-roles/route.ts": [["rpm", "seed-id", {}, F2_SEED_BODY]],
};

/** uploads/route.ts:93 always calls request.formData(), which throws for any non-multipart body. */
const FORMDATA_SEEDS: Record<string, SeedTuple[]> = {
  "POST /app/api/pulp/uploads/route.ts": [["rpm", "seed-id", {}, "{}"]],
};

function seedsFor(handler: DrivenHandler): SeedTuple[] {
  const key = `${handler.method} ${handler.file}`;
  return [...(F1_SEEDS[key] ?? []), ...(F2_SEEDS[key] ?? []), ...(FORMDATA_SEEDS[key] ?? [])];
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("PULP_SESSION_SECRET", "0".repeat(64));
  vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
  cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
  fetchMock = vi.fn(async () => new Response(JSON.stringify(DEFAULT_STUB_BODY), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("route handler discovery", () => {
  it("drives at least 65 handlers (calibration floor)", () => {
    expect(drivenHandlers.length).toBeGreaterThanOrEqual(65);
    expect(skippedExports).toEqual([]);
  });
});

describe.each(drivenHandlers.map((h): [string, DrivenHandler] => [`${h.method} ${h.file}`, h]))(
  "%s",
  (_label, handler) => {
    const examples = seedsFor(handler);

    it("Invariant 1: never throws; whatever comes back is a Response", async () => {
      await fc.assert(
        fc.asyncProperty(kindArb(), idArb(), queryParamsArb(), bodyTextArb(), async (kind, id, query, body) => {
          const response = await driveHandler(handler.fn, { method: handler.method, query, body, kind, id });
          expect(response).toBeInstanceOf(Response);
        }),
        { numRuns: 10, examples }
      );
    });

    it("Invariant 2: any status >= 400 response carries a non-empty string detail", async () => {
      await fc.assert(
        fc.asyncProperty(kindArb(), idArb(), queryParamsArb(), bodyTextArb(), async (kind, id, query, body) => {
          const response = await driveHandler(handler.fn, { method: handler.method, query, body, kind, id });
          if (response.status < 400) {
            return;
          }
          let json: unknown;
          try {
            json = await response.clone().json();
          } catch {
            json = undefined;
          }
          const detail =
            json !== null && typeof json === "object" && "detail" in json
              ? (json as { detail: unknown }).detail
              : undefined;
          expect(typeof detail === "string" && detail.length > 0).toBe(true);
        }),
        { numRuns: 10, examples }
      );
    });
  }
);
