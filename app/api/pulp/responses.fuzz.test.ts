/// <reference types="vite/client" />
/**
 * X5 -- the inverse of routes.fuzz.test.ts (X4): X4 fuzzed the REQUEST side (query/body) against
 * a fixed, well-shaped stub response. This file fixes the request side (a valid kitchen-sink
 * query/body, so every handler gets past its own request-shape validation) and fuzzes what the
 * stubbed `fetch` sends BACK, targeting the bug class this repo keeps hitting: field-shape drift
 * between what a route assumes Pulp returns (`pulpFetch<TData>`'s `data: parsed as TData` is an
 * *unchecked* cast -- the TS type is an assumption, not a runtime guarantee) and what a real
 * server, a proxy, or a network failure actually hands back.
 *
 * Response family fuzzed (see test/fuzz/arbitraries.ts for the shared pieces):
 *   - truncated/malformed JSON text (`{`, `[1,`, a JSON prefix cut mid-string)
 *   - valid JSON that is not an object (null/42/"text"/[]/true)
 *   - an object missing `results`/`count` where a paginated shape is expected
 *   - wrong types on every field the code reads (count: "many", results: {}, results: [null],
 *     pulp_href: 42, ...)
 *   - a 200 with a completely empty body
 *   - a 500 whose body is an HTML error page
 *   - a Content-Type header that lies (application/json on HTML, text/html on JSON)
 *   - a transport-level throw (fetchMock rejects, the unreachable-server case)
 *   - conforming and one-field-mutated shapes pulled from the committed openapi/pulp.json (561
 *     paths, 430 schemas): Paginatedrpm.RpmRepositoryResponseList and rpm.RpmRepositoryResponse,
 *     the schema pair PulpPaginatedJson<T> (app/api/pulp/repositories/_server.ts) is modeled on.
 *     The committed spec has no deb/apt schemas at all (that plugin was absent from the server
 *     that generated it) -- rpm stands in for "a real paginated detail resource" everywhere in
 *     this file; nothing here claims to be deb-specific.
 *
 * Invariant (same shape as routes.fuzz.test.ts's): a route handler never throws -- whatever comes
 * back is a `Response` -- and any `status >= 400` response carries a non-empty string `detail`.
 *
 * M1 pin: Epic M's fix for debt item 31 made `pulpFetch` turn a transport-level throw into
 * `{ ok: false, status: 502, detail: "Could not reach Pulp server at ..." }` instead of letting it
 * escape. The dedicated test below pins that: a transport throw must surface as a 502 with a
 * non-empty detail, never a raw crash.
 *
 * Three pitfalls carried over from the X4 run (routes.fuzz.test.ts's header), handled here as:
 *   1. waitForTask polls 60x with a 5s sleep. The generic per-route response family below never
 *      includes a `task`/`state` key at all, so neither call site (uploads/route.ts's own copy,
 *      and _server.ts's, used by content/rpm/packages) is ever gated into polling during the main
 *      sweep. Both get their own dedicated, fake-timer-driven test further down instead, so the
 *      "task-check response missing `state`" drift case is still covered without a real 5-minute
 *      hang.
 *   2. Auth succeeds in every test (cookie via encodePulpAuth + PULP_SESSION_SECRET/PULP_BASE_URL
 *      stubbed), so every handler gets past requirePulpAuth/withPulpAuth.
 *   3. uploads/route.ts calls requirePulpAuth directly (not withPulpAuth) and reads
 *      request.formData(); it's excluded from the generic JSON-bodied sweep (a JSON body always
 *      throws at request.formData(), a pre-existing, already-cataloged request-shape issue, not a
 *      response-shape one -- see routes.fuzz.test.ts's FORMDATA_SEEDS) and driven with a real
 *      multipart request in its own dedicated test instead.
 *
 * This tier only runs under `npm run fuzz` (see vitest.fuzz.config.ts); excluded from `npm test`.
 */

import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  pulpConformingRepositoryList,
  pulpHref,
  pulpHtmlErrorPage,
  pulpMalformedJsonText,
  pulpMutatedRepositoryList,
  pulpNonObjectJsonText,
} from "@/test/fuzz/arbitraries";
import { encodePulpAuth, pulpErrorDetailFromBody } from "@/lib/pulp";
import {
  hrefFromCreatedResource,
  pulpTaskFailureMessage,
  resolvePublicationHrefAfterTask,
  type CreatedResourceEntry,
} from "@/lib/pulp-task-result";
import { readDetail, waitForTask } from "@/app/api/pulp/repositories/_server";

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

// Same passthrough as routes.fuzz.test.ts: dashboard-summary/route.ts's unstable_cache wrapper
// throws outside a real Next.js request scope otherwise.
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

for (const [file, mod] of Object.entries(routeModules)) {
  if (file === "/app/api/pulp/uploads/route.ts") {
    continue; // driven separately below, with a real multipart request -- see pitfall 3 above.
  }
  for (const method of HTTP_METHODS) {
    const candidate = mod[method];
    if (typeof candidate === "function") {
      drivenHandlers.push({ file, method, fn: candidate as RouteHandler });
    }
  }
}

// --- Fixed, valid request side (this file only fuzzes the RESPONSE) --------

const FIXED_KIND = "rpm";
const FIXED_ID = "00000000-0000-0000-0000-000000000000";
const FIXED_HREF = `/pulp/api/v3/repositories/rpm/rpm/${FIXED_ID}/`;

const FIXED_QUERY: Record<string, string> = {
  pulp_href: FIXED_HREF,
  ref: FIXED_HREF,
  repository: FIXED_HREF,
  content_path: FIXED_HREF,
  path: FIXED_HREF,
  search: "x",
  q: "x",
  name__icontains: "x",
  ordering: "name",
  for_object_type: "core.task",
  id: FIXED_ID,
};

const FIXED_BODY_TEXT = JSON.stringify({
  pulp_href: FIXED_HREF,
  key: "k",
  value: "v",
  role: "r",
  users: ["u"],
  groups: ["g"],
  name: "n",
  base_path: "bp",
  repository: FIXED_HREF,
  publication: FIXED_HREF,
  content_guard: FIXED_HREF,
  remote: FIXED_HREF,
  fields: {},
  add_content_units: [FIXED_HREF],
  remove_content_units: [],
  base_version: FIXED_HREF,
  overwrite: false,
  verify_checksums: true,
  username: "u",
  password: "p",
  first_name: "f",
  last_name: "l",
  email: "e@example.com",
  is_staff: false,
  is_active: true,
  permissions: ["p"],
  description: "d",
  kind: "rpm",
  guards: [FIXED_HREF],
  content: FIXED_HREF,
  repositoryName: "n",
  artifact: "/pulp/api/v3/artifacts/1/",
  pulp_labels: {},
  retain_repo_versions: 1,
  header_name: "h",
  header_value: "v",
  ca_certificate: "c",
});

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

// --- The fuzzed response family ---------------------------------------------

type HttpResponseSpec = { kind: "http"; status: number; bodyText: string; contentType?: string };
type ResponseSpec = HttpResponseSpec | { kind: "throw" };

const SUCCESS_STATUSES = [200, 201, 202] as const;
// 204/304 (and the 1xx family) forbid a body; excluded so `new Response(bodyText, { status })`
// never throws for reasons unrelated to what we're testing.
const ERROR_STATUSES = [400, 401, 403, 404, 409, 422, 500, 502, 503] as const;

function http(
  status: number | fc.Arbitrary<number>,
  bodyText: fc.Arbitrary<string>,
  contentType: fc.Arbitrary<string | undefined> = fc.constant(undefined)
): fc.Arbitrary<HttpResponseSpec> {
  const statusArb = typeof status === "number" ? fc.constant(status) : status;
  return fc
    .tuple(statusArb, bodyText, contentType)
    .map(([s, b, c]) => ({ kind: "http" as const, status: s, bodyText: b, contentType: c }));
}

/** Any JSON value, boxed as a "wrong type" pool for the kitchen-sink object below. */
const WRONG_TYPE_POOL = fc.oneof(
  fc.integer(),
  fc.string(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.jsonValue(), { maxLength: 3 }),
  fc.dictionary(fc.string(), fc.jsonValue(), { maxKeys: 3 })
);

/** Mostly the right type for the field, sometimes deliberately the wrong one. */
function wrongOrRight<T>(right: fc.Arbitrary<T>): fc.Arbitrary<unknown> {
  return fc.oneof(
    { weight: 3, arbitrary: right as fc.Arbitrary<unknown> },
    { weight: 1, arbitrary: WRONG_TYPE_POOL }
  );
}

/**
 * A response body carrying every field name some route in this codebase reads off a Pulp
 * response (count/results/pulp_href/roles/permissions/user fields/...), each independently
 * either well-typed or wrong-typed, and independently possibly entirely absent (requiredKeys: []
 * lets fast-check omit any key, covering "object missing results/count").
 *
 * Deliberately excludes `task`/`state`: those two gate the waitForTask polling loop in
 * uploads/route.ts and _server.ts, and are covered by their own fake-timer-driven tests below
 * instead of the 60x5s-real-time hang a wrong value here could otherwise trigger.
 */
function kitchenSinkResponseObjectArb(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record(
    {
      count: wrongOrRight(fc.nat()),
      next: wrongOrRight(fc.oneof(pulpHref(), fc.constant(null))),
      previous: wrongOrRight(fc.oneof(pulpHref(), fc.constant(null))),
      results: wrongOrRight(
        fc.array(
          fc.oneof(
            fc.record({ pulp_href: pulpHref(), name: fc.string() }),
            fc.constant(null),
            fc.dictionary(fc.string(), fc.jsonValue())
          ),
          { maxLength: 4 }
        )
      ),
      roles: wrongOrRight(fc.array(fc.string())),
      permissions: wrongOrRight(fc.array(fc.string())),
      pulp_href: wrongOrRight(pulpHref()),
      href: wrongOrRight(pulpHref()),
      name: wrongOrRight(fc.string()),
      id: wrongOrRight(fc.integer()),
      username: wrongOrRight(fc.string()),
      first_name: wrongOrRight(fc.string()),
      last_name: wrongOrRight(fc.string()),
      email: wrongOrRight(fc.string()),
      is_staff: wrongOrRight(fc.boolean()),
      is_active: wrongOrRight(fc.boolean()),
      date_joined: wrongOrRight(fc.string()),
      detail: wrongOrRight(fc.string()),
      non_field_errors: wrongOrRight(fc.array(fc.string())),
      artifact: wrongOrRight(fc.string()),
      error: fc.jsonValue(),
      created_resources: wrongOrRight(
        fc.array(fc.oneof(fc.string(), fc.record({ pulp_href: pulpHref() })))
      ),
      progress_reports: wrongOrRight(fc.array(fc.dictionary(fc.string(), fc.jsonValue()))),
    },
    { requiredKeys: [] }
  );
}

function kitchenSinkResponseText(): fc.Arbitrary<string> {
  return kitchenSinkResponseObjectArb().map((o) => JSON.stringify(o));
}

function responseSpecArb(): fc.Arbitrary<ResponseSpec> {
  return fc.oneof(
    { weight: 1, arbitrary: fc.constant<ResponseSpec>({ kind: "throw" }) },
    { weight: 2, arbitrary: http(fc.constantFrom(200, 500), pulpMalformedJsonText()) },
    { weight: 2, arbitrary: http(fc.constant(200), pulpNonObjectJsonText()) },
    { weight: 3, arbitrary: http(fc.constantFrom(...SUCCESS_STATUSES), kitchenSinkResponseText()) },
    { weight: 2, arbitrary: http(fc.constantFrom(...ERROR_STATUSES), kitchenSinkResponseText()) },
    { weight: 1, arbitrary: http(fc.constant(200), fc.constant("")) },
    { weight: 1, arbitrary: http(fc.constantFrom(500, 502, 503), pulpHtmlErrorPage()) },
    {
      weight: 2,
      arbitrary: http(
        fc.constantFrom(...SUCCESS_STATUSES),
        pulpConformingRepositoryList().map((o) => JSON.stringify(o))
      ),
    },
    {
      weight: 2,
      arbitrary: http(
        fc.constantFrom(...SUCCESS_STATUSES),
        pulpMutatedRepositoryList().map((o) => JSON.stringify(o))
      ),
    },
    {
      weight: 1,
      arbitrary: fc.oneof(
        http(fc.constantFrom(...SUCCESS_STATUSES), kitchenSinkResponseText(), fc.constant("text/html")),
        http(fc.constant(500), pulpHtmlErrorPage(), fc.constant("application/json"))
      ),
    }
  );
}

/** Deterministic seeds covering the exact families/literals called out in the task, one per bullet. */
const EXPLICIT_SEEDS: ResponseSpec[] = [
  { kind: "http", status: 200, bodyText: "{" },
  { kind: "http", status: 200, bodyText: "[1," },
  { kind: "http", status: 200, bodyText: "null" },
  { kind: "http", status: 200, bodyText: "42" },
  { kind: "http", status: 200, bodyText: '"just a string"' },
  { kind: "http", status: 200, bodyText: "[]" },
  { kind: "http", status: 200, bodyText: "true" },
  { kind: "http", status: 200, bodyText: "{}" },
  { kind: "http", status: 200, bodyText: JSON.stringify({ results: [] }) },
  { kind: "http", status: 200, bodyText: JSON.stringify({ count: 0 }) },
  { kind: "http", status: 200, bodyText: JSON.stringify({ count: "many", results: [], next: null, previous: null }) },
  { kind: "http", status: 200, bodyText: JSON.stringify({ count: 0, results: {}, next: null, previous: null }) },
  { kind: "http", status: 200, bodyText: JSON.stringify({ count: 0, results: [null], next: null, previous: null }) },
  { kind: "http", status: 200, bodyText: JSON.stringify({ pulp_href: 42 }) },
  { kind: "http", status: 200, bodyText: "" },
  { kind: "http", status: 500, bodyText: "<html><body><h1>500</h1></body></html>" },
  {
    kind: "http",
    status: 200,
    bodyText: JSON.stringify({ count: 0, results: [], next: null, previous: null }),
    contentType: "text/html",
  },
  { kind: "http", status: 500, bodyText: "<html><body><h1>500</h1></body></html>", contentType: "application/json" },
  { kind: "throw" },
];
const EXPLICIT_SEED_EXAMPLES: [ResponseSpec][] = EXPLICIT_SEEDS.map((s) => [s]);

function applySpec(mock: ReturnType<typeof vi.fn>, spec: ResponseSpec): void {
  if (spec.kind === "throw") {
    mock.mockImplementation(async () => {
      throw new TypeError("fetch failed");
    });
    return;
  }
  mock.mockImplementation(async () => {
    const headers = new Headers();
    if (spec.contentType) {
      headers.set("content-type", spec.contentType);
    }
    return new Response(spec.bodyText, { status: spec.status, headers });
  });
}

// --- Harness -----------------------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("PULP_SESSION_SECRET", "0".repeat(64));
  vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
  cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
  fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), { status: 200 })
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("route handler discovery", () => {
  it("drives at least 60 handlers (calibration floor, uploads excluded)", () => {
    expect(drivenHandlers.length).toBeGreaterThanOrEqual(60);
  });
});

describe.each(drivenHandlers.map((h): [string, DrivenHandler] => [`${h.method} ${h.file}`, h]))(
  "%s",
  (_label, handler) => {
    it("Invariant 1: never throws regardless of what Pulp's response looks like", async () => {
      await fc.assert(
        fc.asyncProperty(responseSpecArb(), async (spec) => {
          applySpec(fetchMock, spec);
          const response = await driveHandler(handler.fn, {
            method: handler.method,
            query: FIXED_QUERY,
            body: FIXED_BODY_TEXT,
            kind: FIXED_KIND,
            id: FIXED_ID,
          });
          expect(response).toBeInstanceOf(Response);
        }),
        { numRuns: 8, examples: EXPLICIT_SEED_EXAMPLES }
      );
    });

    it("Invariant 2: any status >= 400 response carries a non-empty string detail", async () => {
      await fc.assert(
        fc.asyncProperty(responseSpecArb(), async (spec) => {
          applySpec(fetchMock, spec);
          // A handler that *throws* is Invariant 1's finding, not this one. This
          // property is only about the shape of a response that came back, so a
          // throw is skipped here rather than double-counted as a second defect.
          let response: Response;
          try {
            response = await driveHandler(handler.fn, {
              method: handler.method,
              query: FIXED_QUERY,
              body: FIXED_BODY_TEXT,
              kind: FIXED_KIND,
              id: FIXED_ID,
            });
          } catch {
            return;
          }
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
        { numRuns: 8, examples: EXPLICIT_SEED_EXAMPLES }
      );
    });
  }
);

// --- M1 pin: transport throw -> 502 with a non-empty detail, never a crash -------------------

describe("M1 pin (debt item 31): a transport-level throw must never escape as a raw crash", () => {
  it("pulpFetch's catch turns fetch()'s throw into a 502 with a detail mentioning the unreachable server", async () => {
    const handler = drivenHandlers.find(
      (h) => h.method === "GET" && h.file === "/app/api/pulp/repositories/[kind]/route.ts"
    );
    expect(handler).toBeDefined();

    fetchMock.mockImplementation(async () => {
      throw new TypeError("fetch failed");
    });

    const response = await driveHandler(handler!.fn, {
      method: "GET",
      query: FIXED_QUERY,
      body: "",
      kind: FIXED_KIND,
      id: FIXED_ID,
    });

    expect(response.status).toBe(502);
    const json = (await response.json()) as { detail?: unknown };
    expect(typeof json.detail).toBe("string");
    expect((json.detail as string).length).toBeGreaterThan(0);
    expect(json.detail).toContain("Could not reach Pulp server");
  });
});

// --- waitForTask hang safety: a task-check response missing `state` ---------------------------
//
// The sharpest field-shape-drift case on the response side: waitForTask (_server.ts:140) reads
// task.state and treats anything non-terminal as "poll again", so a task body that simply has no
// `state` key at all is polled the full 60 times. Driven through a route that would be 60 x 5s of
// real time, which is why this is asserted against waitForTask directly under fake timers rather
// than through a handler. The invariant is that it gives up with a catchable Error -- it must not
// hang forever, and it must not resolve as though the task had completed.

describe("waitForTask against a task response missing `state`", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives up with a catchable error rather than polling forever", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ pulp_href: "/pulp/api/v3/tasks/deadbeef/" }), { status: 200 })
    );

    // Attach the handlers synchronously, before any timer is advanced: waitForTask rejects while
    // advanceTimersByTimeAsync is still awaiting, and an unattached rejection at that point is an
    // unhandled rejection that fails the whole file.
    const settled = waitForTask("/tasks/deadbeef/", { username: "admin", password: "admin" }).then(
      () => "resolved",
      (error: unknown) => (error instanceof Error ? error.message : "non-error rejection")
    );

    // 60 attempts x 5s, plus a margin so the final attempt's sleep is drained too.
    await vi.advanceTimersByTimeAsync(60 * 5000 + 5000);

    expect(await settled).toBe("Task did not complete within timeout period.");
  });
});

// --- Pure readers: fed generated response bodies directly, no fetch/route involved ------------
//
// hrefFromCreatedResource/resolvePublicationHrefAfterTask/pulpTaskFailureMessage are typed against
// the SHAPE Pulp is assumed to return, but every value they read ultimately came from
// `JSON.parse` of an HTTP body -- `unknown` at the true boundary. Casting generated values past
// their declared parameter types here is the deliberate exception to arbitraries.ts's oracle rule
// 3: this *is* the field-shape-drift boundary X5 targets, not pure-logic testing.

describe("pure readers", () => {
  it("pulpErrorDetailFromBody: never throws; a non-null result is always a non-empty bounded string", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.jsonValue(), pulpConformingRepositoryList(), pulpMutatedRepositoryList()),
        (body) => {
          const result = pulpErrorDetailFromBody(body);
          expect(
            result === null || (typeof result === "string" && result.length > 0 && result.length < 100_000)
          ).toBe(true);
        }
      )
    );
  });

  it("readDetail: never throws; always returns a non-empty bounded string", async () => {
    await fc.assert(
      fc.asyncProperty(responseSpecArb(), async (spec) => {
        if (spec.kind === "throw") {
          return; // readDetail takes an already-received Response; a transport throw is N/A here.
        }
        const headers = new Headers();
        if (spec.contentType) {
          headers.set("content-type", spec.contentType);
        }
        const response = new Response(spec.bodyText, { status: spec.status, headers });
        const detail = await readDetail(response);
        expect(typeof detail).toBe("string");
        expect(detail.length).toBeGreaterThan(0);
        expect(detail.length).toBeLessThan(100_000);
      })
    );
  });

  it("hrefFromCreatedResource: never throws; result is null or a string (possibly empty)", () => {
    fc.assert(
      fc.property(fc.oneof(fc.constant(undefined), fc.jsonValue()), (entry) => {
        const result = hrefFromCreatedResource(entry as unknown as CreatedResourceEntry | undefined);
        expect(result === null || typeof result === "string").toBe(true);
      })
    );
  });

  const driftedTaskArb = fc.record(
    {
      created_resources: fc.oneof(
        fc.array(fc.oneof(fc.string(), fc.record({ pulp_href: fc.jsonValue() }, { requiredKeys: [] }))),
        fc.jsonValue()
      ),
      pulp_href: fc.jsonValue(),
      href: fc.jsonValue(),
    },
    { requiredKeys: [] }
  );

  it("resolvePublicationHrefAfterTask: never throws; result is null or a string (possibly empty)", () => {
    fc.assert(
      fc.property(driftedTaskArb, fc.oneof(fc.string(), fc.constant(null)), (task, fallback) => {
        const result = resolvePublicationHrefAfterTask(
          task as unknown as Parameters<typeof resolvePublicationHrefAfterTask>[0],
          fallback
        );
        expect(result === null || typeof result === "string").toBe(true);
      })
    );
  });

  it("pulpTaskFailureMessage: never throws; result is null or a string (possibly empty)", () => {
    fc.assert(
      fc.property(
        fc.record({ state: fc.oneof(fc.string(), fc.jsonValue()), error: fc.jsonValue() }, { requiredKeys: [] }),
        (task) => {
          const result = pulpTaskFailureMessage(
            task as unknown as Parameters<typeof pulpTaskFailureMessage>[0]
          );
          expect(result === null || typeof result === "string").toBe(true);
        }
      )
    );
  });
});
