/**
 * Shared fast-check arbitraries for the fuzz tier (`npm run fuzz`, see
 * vitest.fuzz.config.ts). Every `*.fuzz.test.ts` file should build its
 * properties on top of these instead of hand-rolling its own generators, so
 * the domain shapes stay consistent across properties.
 *
 * ORACLE HYGIENE RULES (apply to every fuzz property, not just this file):
 *
 * 1. Never reimplement the code under test as its own oracle. Derive
 *    expectations from an independent authority: WHATWG URL semantics, the
 *    OpenAPI spec, Pulp's own response, or a round-trip through the inverse
 *    function.
 * 2. State the invariant over the part of the value it is about. "No `..`
 *    in the path" is not "no `..` in the string".
 * 3. Generated values must inhabit the declared TypeScript type. If a
 *    property needs a value the type forbids, the type is wrong -- fix the
 *    type, do not fuzz past it.
 * 4. A property that is only ever true because the arbitrary is too narrow
 *    is worse than no property. Use `fc.statistics` on a sample when a
 *    generator has preconditions.
 * 5. `fc.string()` defaults to `grapheme-ascii`; do not hand-roll string
 *    generators. Unpaired surrogates caused 4 of 8 false findings in the
 *    exploratory run.
 */

import fc from "fast-check";

import { PULP_PAGE_SIZES, type PulpListQuery } from "@/lib/pulp-list-query";
import type { CreatedResourceEntry, TaskResponse } from "@/app/api/pulp/repositories/_server";
import type { PulpTaskProgressReport } from "@/services/pulp/types";
import pulpSpec from "@/openapi/pulp.json";

/** Bad authority strings that make `new URL()` throw, for the invalid-absolute family below. */
const badAuthorities = fc.constantFrom(
  "h:8080;",
  "[",
  "%%",
  "h:ap;ort",
  "%zz",
  "[::1",
  "user@[",
  "h::80"
);

const pulpResourcePath = fc
  .tuple(fc.webSegment(), fc.webSegment())
  .map(([kind, subkind]) => `${kind}/${subkind}`);

/** Absolute, well-formed hrefs: a real webUrl with its path replaced by a `/pulp/api/v3/...` shape. */
const absoluteValidHref = fc
  .tuple(
    fc.webUrl({ withQueryParameters: true, withFragments: true }),
    pulpResourcePath,
    fc.uuid()
  )
  .map(([base, resourcePath, id]) => {
    const url = new URL(base);
    url.pathname = `/pulp/api/v3/${resourcePath}/${id}/`;
    return url.toString();
  });

/** Relative, root-rooted hrefs, e.g. "/repositories/rpm/rpm/<uuid>/". */
const relativeRootedHref = fc
  .tuple(pulpResourcePath, fc.uuid())
  .map(([resourcePath, id]) => `/repositories/${resourcePath}/${id}/`);

/** Protocol-relative hrefs, e.g. "//host/pulp/api/v3/...". */
const protocolRelativeHref = fc
  .tuple(fc.webAuthority(), pulpResourcePath, fc.uuid())
  .map(([authority, resourcePath, id]) => `//${authority}/pulp/api/v3/${resourcePath}/${id}/`);

/** Dot-segment shapes embedded mid-path, in both literal and percent-encoded form. */
const dotSegmentHref = fc
  .tuple(pulpResourcePath, fc.constantFrom("../", "..%2f", "%2e%2e/"), fc.uuid())
  .map(([resourcePath, dotSegment, id]) => `/repositories/${resourcePath}/${dotSegment}${id}/`);

/** Query-string and fragment variants, including a `/` inside the query value. */
const queryAndFragmentHref = fc
  .tuple(fc.uuid(), fc.constantFrom("?a=/", "#frag", "?a=/#frag"))
  .map(([id, suffix]) => `/repositories/rpm/rpm/${id}/${suffix}`);

/** Absolute-shaped hrefs with a malformed authority, which make `new URL()` throw. */
const invalidAbsoluteHref = fc
  .tuple(fc.constantFrom("http://", "https://"), badAuthorities, fc.constantFrom("/repositories/", "/pulp/api/v3/repositories/rpm/rpm/"))
  .map(([scheme, authority, path]) => `${scheme}${authority}${path}`);

/**
 * A href-shaped string covering the families Pulp's own hrefs and adversarial
 * inputs can take: absolute, relative-rooted, protocol-relative, dot-segment,
 * query/fragment variants, and invalid-absolute shapes that make `new URL()`
 * throw.
 */
export function pulpHref(): fc.Arbitrary<string> {
  return fc.oneof(
    absoluteValidHref,
    relativeRootedHref,
    protocolRelativeHref,
    dotSegmentHref,
    queryAndFragmentHref,
    invalidAbsoluteHref
  );
}

/** Values that inhabit PulpListQuery, drawing pageSize from the real PULP_PAGE_SIZES. */
export function pulpListQuery(): fc.Arbitrary<PulpListQuery> {
  return fc.record({
    search: fc.string(),
    ordering: fc.string(),
    page: fc.integer({ min: 1 }),
    pageSize: fc.constantFrom(...PULP_PAGE_SIZES),
    labelSelect: fc.string(),
    q: fc.string(),
  });
}

/** A value nested `keys.length` objects deep, so deep nesting is always reachable (see F-8). */
const deeplyNestedValue = fc
  .tuple(
    fc.array(fc.string({ minLength: 1, maxLength: 6 }), { minLength: 3, maxLength: 8 }),
    fc.oneof(fc.string(), fc.array(fc.jsonValue()))
  )
  .map(([keys, leaf]) => keys.reduceRight<unknown>((acc, key) => ({ [key]: acc }), leaf));

const fieldErrorValue = fc.oneof(fc.string(), fc.array(fc.jsonValue()), deeplyNestedValue);

/**
 * Values biased toward the DRF error shapes lib/pulp.ts:pulpErrorDetailFromBody actually reads,
 * over the full fc.jsonValue() space so unrecognized shapes are covered too.
 */
export function pulpErrorBody(): fc.Arbitrary<unknown> {
  return fc.oneof(
    { weight: 2, arbitrary: fc.record({ detail: fc.string() }) },
    { weight: 2, arbitrary: fc.record({ detail: fc.array(fc.jsonValue()) }) },
    { weight: 2, arbitrary: fc.record({ non_field_errors: fc.array(fc.jsonValue()) }) },
    { weight: 2, arbitrary: fc.dictionary(fc.string({ minLength: 1 }), fieldErrorValue, { minKeys: 1 }) },
    { weight: 1, arbitrary: fc.jsonValue() }
  );
}

const createdResourceEntry: fc.Arbitrary<CreatedResourceEntry> = fc.oneof(
  fc.string(),
  fc.record({ pulp_href: fc.string() }),
  fc.record({ href: fc.string() })
);

const pulpTaskState = fc.oneof(
  fc.constantFrom("waiting", "running", "completed", "failed", "canceled", "canceling", "skipped"),
  fc.string()
);

/**
 * Hrefs for TaskResponse.pulp_href/href, built from the same resource-path shape as pulpHref()
 * but weighted across resource kinds so "/publications/" sometimes appears (and sometimes does
 * not), since resolvePublicationHrefAfterTask branches on exactly that substring.
 */
const taskHref = fc
  .tuple(fc.constantFrom("publications", "repositories", "distributions"), pulpResourcePath, fc.uuid())
  .map(([resource, resourcePath, id]) => `/pulp/api/v3/${resource}/${resourcePath}/${id}/`);

const pulpTaskProgressReport: fc.Arbitrary<PulpTaskProgressReport> = fc.record({
  message: fc.string(),
  code: fc.string(),
  state: fc.string(),
  total: fc.integer(),
  done: fc.integer(),
  suffix: fc.oneof(fc.string(), fc.constant(null)),
});

/**
 * Values that inhabit TaskResponse, covering the real Pulp task states plus arbitrary strings.
 * pulp_href, href and progress_reports are optional, matching the type -- and are sometimes
 * absent -- so resolvePublicationHrefAfterTask's pulp_href/href branches are actually reachable.
 */
export function pulpTask(): fc.Arbitrary<TaskResponse> {
  return fc.record(
    {
      state: pulpTaskState,
      created_resources: fc.array(createdResourceEntry),
      error: fc.jsonValue(),
      pulp_href: taskHref,
      href: taskHref,
      progress_reports: fc.array(pulpTaskProgressReport),
    },
    { requiredKeys: ["state", "created_resources", "error"] }
  );
}

// --- Response-side arbitraries (X5: fuzzing what Pulp sends back) ----------

/** Truncated/malformed JSON text -- never valid JSON, exercises the JSON.parse-failure paths. */
export function pulpMalformedJsonText(): fc.Arbitrary<string> {
  const midStringCut = fc
    .string({ minLength: 5, maxLength: 30 })
    .map((s) => JSON.stringify({ name: s }))
    .chain((full) => fc.integer({ min: 1, max: Math.max(1, full.length - 2) }).map((n) => full.slice(0, n)));

  return fc.oneof(
    fc.constantFrom("{", "[1,", "[", '{"a":', '{"a":1,}', "not json", ""),
    midStringCut
  );
}

/** Valid JSON whose top-level value is not an object -- null/number/string/array/boolean. */
export function pulpNonObjectJsonText(): fc.Arbitrary<string> {
  return fc.constantFrom("null", "42", '"just a string"', "[]", "true", "-17.5");
}

/** A 500-shaped HTML error page body, the way a proxy/app-server error page (not Pulp/DRF) looks. */
export function pulpHtmlErrorPage(): fc.Arbitrary<string> {
  return fc.constantFrom(
    "<html><head><title>500 Internal Server Error</title></head><body><h1>Internal Server Error</h1></body></html>",
    "<!DOCTYPE html><html><body><h1>502 Bad Gateway</h1><p>nginx</p></body></html>"
  );
}

/**
 * The two schemas pulled from the committed `openapi/pulp.json` (561 paths, 430 schemas) that
 * back `PulpPaginatedJson<T>` (app/api/pulp/repositories/_server.ts) for a real Pulp list
 * endpoint: a paginated list wrapper and its detail item. Read with a narrow query, not loaded
 * wholesale. The committed spec has no deb/apt schemas (that plugin was absent from the server
 * that generated it, see openapi/pulp.json's info block) -- rpm stands in for "a real paginated
 * detail resource" everywhere below; nothing here is deb-specific.
 */
type OpenApiSchema = {
  type?: string;
  format?: string;
  nullable?: boolean;
  properties?: Record<string, OpenApiSchema>;
  $ref?: string;
};

type OpenApiDoc = { components: { schemas: Record<string, OpenApiSchema> } };

function resolveSchemaRef(schema: OpenApiSchema): OpenApiSchema {
  if (schema.$ref) {
    const name = schema.$ref.replace("#/components/schemas/", "");
    return (pulpSpec as unknown as OpenApiDoc).components.schemas[name] ?? {};
  }
  return schema;
}

const REPOSITORY_LIST_SCHEMA = resolveSchemaRef({
  $ref: "#/components/schemas/Paginatedrpm.RpmRepositoryResponseList",
});
const REPOSITORY_DETAIL_SCHEMA = resolveSchemaRef({
  $ref: "#/components/schemas/rpm.RpmRepositoryResponse",
});

/** Builds an arbitrary that inhabits a single OpenAPI property schema's declared type. */
function arbForOpenApiProperty(schema: OpenApiSchema | undefined): fc.Arbitrary<unknown> {
  if (!schema) {
    return fc.constant(undefined);
  }
  const resolved = resolveSchemaRef(schema);
  let base: fc.Arbitrary<unknown>;
  switch (resolved.type) {
    case "integer":
      base = fc.integer();
      break;
    case "boolean":
      base = fc.boolean();
      break;
    case "object":
      base = fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.constant(null)));
      break;
    case "string":
    default:
      base = resolved.format === "uri" ? pulpHref() : fc.string();
  }
  return resolved.nullable ? fc.oneof(base, fc.constant(null)) : base;
}

/** Fields pulled straight from rpm.RpmRepositoryResponse's own `properties` keys. */
const REPOSITORY_DETAIL_FIELDS = [
  "pulp_href",
  "name",
  "description",
  "retain_repo_versions",
  "autopublish",
  "pulp_labels",
] as const;

/** A conforming repository detail object, typed per openapi/pulp.json's rpm.RpmRepositoryResponse. */
export function pulpConformingRepositoryDetail(): fc.Arbitrary<Record<string, unknown>> {
  const shape: Record<string, fc.Arbitrary<unknown>> = {};
  for (const key of REPOSITORY_DETAIL_FIELDS) {
    shape[key] = arbForOpenApiProperty(REPOSITORY_DETAIL_SCHEMA.properties?.[key]);
  }
  return fc.record(shape);
}

/** A conforming paginated list, typed per openapi/pulp.json's Paginatedrpm.RpmRepositoryResponseList. */
export function pulpConformingRepositoryList(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record({
    count: arbForOpenApiProperty(REPOSITORY_LIST_SCHEMA.properties?.count),
    next: arbForOpenApiProperty(REPOSITORY_LIST_SCHEMA.properties?.next),
    previous: arbForOpenApiProperty(REPOSITORY_LIST_SCHEMA.properties?.previous),
    results: fc.array(pulpConformingRepositoryDetail(), { maxLength: 5 }),
  });
}

const WRONG_TYPE_VALUES = fc.oneof(
  fc.integer(),
  fc.boolean(),
  fc.dictionary(fc.string(), fc.string()),
  fc.constant(null)
);

/** The conforming paginated list with exactly one of count/next/previous/results wrong-typed. */
export function pulpMutatedRepositoryList(): fc.Arbitrary<Record<string, unknown>> {
  return fc
    .tuple(
      pulpConformingRepositoryList(),
      fc.constantFrom("count", "next", "previous", "results"),
      WRONG_TYPE_VALUES
    )
    .map(([obj, key, wrongValue]) => ({ ...obj, [key]: wrongValue }));
}
