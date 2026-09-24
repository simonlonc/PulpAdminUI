/**
 * Fuzz properties for lib/pulp-plugin-derive.ts (derivePulpPlugins). The spec
 * arbitrary here mutates the shape lib/pulp-plugin-derive.test.ts's hand-built
 * fixture uses -- generated app/type identifiers, generated field schemas,
 * and wrong-shaped values substituted in place of an object/array/string at
 * various points -- rather than fc.anything(), which would almost never
 * reach the derivation logic (every step needs matching path keys, $ref
 * chains and property records to get anywhere near a descriptor).
 *
 * Expected to PASS: derivePulpPlugins is documented to never throw and to
 * skip (not half-build) anything it cannot derive reliably. If either
 * property below turns out RED, that is a real defect in the module, not a
 * miscalibrated property -- report it, do not fix it (fixes are a later
 * task).
 *
 * This tier only runs under `npm run fuzz` (see vitest.fuzz.config.ts); it is
 * excluded from `npm test`.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { derivePulpPlugins } from "@/lib/pulp-plugin-derive";

const API_PREFIX = "/pulp/api/v3";

type JsonRecord = Record<string, unknown>;

// Pulp app/type identifiers: short, lowercase, alphanumeric -- close enough to real Pulp
// plugin app labels (rpm, deb, container, ...) to drive the `{app}/{type}/` path pattern
// listResourcePaths matches on, without the near-zero hit rate fc.webSegment() would give.
const identifier = fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/);

const fieldName = fc.stringMatching(/^[a-z][a-z0-9_]{0,10}$/);

// A value of the wrong shape for wherever it is substituted, so the property exercises
// derivePulpPlugins's asRecord/asStringArray guards instead of only ever feeding them
// well-formed objects.
const wrongShape: fc.Arbitrary<unknown> = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
  fc.array(fc.jsonValue(), { maxLength: 3 })
);

function sometimesWrong<T>(valid: fc.Arbitrary<T>): fc.Arbitrary<unknown> {
  return fc.oneof({ weight: 4, arbitrary: valid }, { weight: 1, arbitrary: wrongShape });
}

// A property schema: usually a plain { type }, sometimes an array with an inline
// items.enum (reaches the string_list branch in buildExtraRemoteFields and the
// array-of-enum branch in buildSyncFields), sometimes an inline string enum (reaches
// buildSyncFields's enum branch), sometimes wrong-shaped entirely.
const propertySchema: fc.Arbitrary<unknown> = sometimesWrong(
  fc.oneof(
    fc.record({ type: fc.constantFrom("string", "boolean", "integer", "number", "object") }),
    fc.record({
      type: fc.constant("array"),
      items: sometimesWrong(
        fc.record({ type: fc.constant("string"), enum: fc.array(fieldName, { minLength: 1, maxLength: 4 }) })
      ),
    }),
    fc.record({
      type: fc.option(fc.constant("string"), { nil: undefined }),
      enum: fc.array(fieldName, { minLength: 1, maxLength: 4 }),
      default: fc.option(fieldName, { nil: undefined }),
    })
  )
);

const propertiesRecord = fc.dictionary(fieldName, propertySchema, { maxKeys: 5 });

/** A components.schemas entry: usually { properties, required }, sometimes wrong-shaped. */
const schemaEntryArb: fc.Arbitrary<unknown> = sometimesWrong(
  fc.record({
    properties: sometimesWrong(propertiesRecord),
    required: sometimesWrong(fc.array(fieldName, { maxLength: 3 })),
  })
);

/** A `paths` entry's POST operation, referencing `schemaName` through the usual $ref chain. */
function postOperationArb(schemaName: string): fc.Arbitrary<unknown> {
  const ref = sometimesWrong(fc.constant(`#/components/schemas/${schemaName}`));
  const schemaWrapper = sometimesWrong(fc.record({ $ref: ref }));
  const jsonMedia = sometimesWrong(fc.record({ schema: schemaWrapper }));
  const content = sometimesWrong(fc.record({ "application/json": jsonMedia }));
  const requestBody = sometimesWrong(fc.record({ content }));
  return sometimesWrong(fc.record({ requestBody }));
}

/** A content list path's GET operation, returning items shaped by `itemSchemaName` through the paginated wrapper. */
function getListOperationArb(pageSchemaName: string): fc.Arbitrary<unknown> {
  const pageRef = sometimesWrong(fc.constant(`#/components/schemas/${pageSchemaName}`));
  const schemaWrapper = sometimesWrong(fc.record({ $ref: pageRef }));
  const jsonMedia = sometimesWrong(fc.record({ schema: schemaWrapper }));
  const content = sometimesWrong(fc.record({ "application/json": jsonMedia }));
  const ok = sometimesWrong(fc.record({ content }));
  const responses = sometimesWrong(fc.record({ "200": ok }));
  return sometimesWrong(fc.record({ responses }));
}

/** One content endpoint's paths/schemas contribution, plus the pulp_type tag it corresponds to. */
function contentEndpointArb(app: string, typeSegment: string) {
  const pageSchemaName = `${app}_${typeSegment}_Paginated`;
  const itemSchemaName = `${app}_${typeSegment}_Item`;
  const typeTag = `${app}.${typeSegment}`;
  const path = `${API_PREFIX}/content/${app}/${typeSegment}/`;

  const itemSchemaArb: fc.Arbitrary<unknown> = sometimesWrong(
    fc.record({
      properties: sometimesWrong(
        fc.record(
          {
            name: fc.constant({ type: "string" }),
            size: fc.constant({ type: "integer" }),
            version: fc.constant({ type: "string" }),
            extra: propertiesRecord,
          },
          { requiredKeys: [] }
        ).map((picked) => {
          const properties: JsonRecord = { ...(picked.extra as JsonRecord) };
          if ("name" in picked) properties.name = picked.name;
          if ("size" in picked) properties.size = picked.size;
          if ("version" in picked) properties.version = picked.version;
          return properties;
        })
      ),
    })
  );

  const pageSchemaArb: fc.Arbitrary<unknown> = sometimesWrong(
    fc.record({
      properties: sometimesWrong(
        fc.record({
          results: sometimesWrong(fc.record({ items: sometimesWrong(fc.record({ $ref: fc.constant(`#/components/schemas/${itemSchemaName}`) })) })),
        })
      ),
    })
  );

  return fc
    .record({
      getOperation: getListOperationArb(pageSchemaName),
      pageSchema: pageSchemaArb,
      itemSchema: itemSchemaArb,
    })
    .map(({ getOperation, pageSchema, itemSchema }) => ({
      path,
      pageSchemaName,
      itemSchemaName,
      typeTag,
      getOperation,
      pageSchema,
      itemSchema,
    }));
}

type FamilySpec = { paths: JsonRecord; schemas: JsonRecord; typeTags: string[] };

/** One plugin family's worth of paths/schemas, with every optional piece sometimes present, sometimes absent, sometimes malformed. */
function familyArb(app: string, type: string): fc.Arbitrary<FamilySpec> {
  const repoSchemaName = `${app}_${type}_Repository`;
  const remoteSchemaName = `${app}_${type}_Remote`;
  const syncSchemaName = `${app}_${type}_SyncURL`;

  return fc
    .record({
      hasRepoPost: fc.boolean(),
      repoPostOperation: postOperationArb(repoSchemaName),
      repoSchema: schemaEntryArb,
      hasRemote: fc.boolean(),
      remotePostOperation: postOperationArb(remoteSchemaName),
      remoteSchema: schemaEntryArb,
      hasDistribution: fc.boolean(),
      distributionValue: sometimesWrong(fc.constant({})),
      hasPublication: fc.boolean(),
      publicationValue: sometimesWrong(fc.constant({})),
      contentCount: fc.integer({ min: 0, max: 3 }),
      hasSync: fc.boolean(),
      syncPostOperation: postOperationArb(syncSchemaName),
      syncSchema: schemaEntryArb,
    })
    .chain((cfg) =>
      fc
        .tuple(...Array.from({ length: cfg.contentCount }, (_, i) => contentEndpointArb(app, `${type}${i}`)))
        .map((contentEntries) => ({ cfg, contentEntries }))
    )
    .map(({ cfg, contentEntries }) => {
      const paths: JsonRecord = {};
      const schemas: JsonRecord = {};

      paths[`${API_PREFIX}/repositories/${app}/${type}/`] = cfg.hasRepoPost
        ? { post: cfg.repoPostOperation }
        : { get: {} };
      schemas[repoSchemaName] = cfg.repoSchema;

      if (cfg.hasRemote) {
        paths[`${API_PREFIX}/remotes/${app}/${type}/`] = { post: cfg.remotePostOperation };
        schemas[remoteSchemaName] = cfg.remoteSchema;
      }
      if (cfg.hasDistribution) {
        paths[`${API_PREFIX}/distributions/${app}/${type}/`] = cfg.distributionValue;
      }
      if (cfg.hasPublication) {
        paths[`${API_PREFIX}/publications/${app}/${type}/`] = cfg.publicationValue;
      }

      const typeTags: string[] = [];
      for (const entry of contentEntries) {
        paths[entry.path] = entry.getOperation;
        schemas[entry.pageSchemaName] = entry.pageSchema;
        schemas[entry.itemSchemaName] = entry.itemSchema;
        typeTags.push(entry.typeTag);
      }

      if (cfg.hasSync) {
        const syncKey = `{${app}_${type.replaceAll("-", "_")}_repository_href}sync/`;
        paths[syncKey] = { post: cfg.syncPostOperation };
        schemas[syncSchemaName] = cfg.syncSchema;
      }

      return { paths, schemas, typeTags };
    });
}

/** The `pulp_type` query parameter on `/pulp/api/v3/content/`, built from the families' own content type tags plus noise. */
function pulpTypeParamArb(typeTags: string[]): fc.Arbitrary<unknown> {
  const enumValues = fc.shuffledSubarray(typeTags).chain((chosen) =>
    fc.array(fieldName, { maxLength: 3 }).map((noise) => [...chosen, ...noise.map((n) => `noise.${n}`)])
  );
  return sometimesWrong(
    fc.record({
      name: fc.constant("pulp_type"),
      schema: sometimesWrong(fc.record({ enum: sometimesWrong(enumValues) })),
    })
  );
}

/** A full spec: one or two families sharing distinct app names, merged into one paths/schemas document. */
const specArb: fc.Arbitrary<unknown> = fc
  .uniqueArray(identifier, { minLength: 1, maxLength: 2 })
  .chain((apps) => fc.tuple(...apps.map((app) => fc.tuple(fc.constant(app), identifier).chain(([a, type]) => familyArb(a, type)))))
  .chain((families) =>
    fc.array(pulpTypeParamArb(families.flatMap((f) => f.typeTags)), { minLength: 0, maxLength: 1 }).map((parameters) => ({
      families,
      parameters,
    }))
  )
  .map(({ families, parameters }) => {
    const paths: JsonRecord = {};
    const schemas: JsonRecord = {};
    for (const family of families) {
      Object.assign(paths, family.paths);
      Object.assign(schemas, family.schemas);
    }
    paths[`${API_PREFIX}/content/`] = { get: { parameters } };
    return { paths, components: { schemas } };
  });

describe("derivePulpPlugins", () => {
  it("never throws on an OpenAPI-spec-shaped input", () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        expect(() => derivePulpPlugins(spec)).not.toThrow();
      })
    );
  });

  it("every derived descriptor has a non-empty kind and only absolute (leading-slash) paths", () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        const families = derivePulpPlugins(spec);
        for (const family of families) {
          expect(family.kind.length).toBeGreaterThan(0);
          expect(family.repositoryPath.startsWith("/")).toBe(true);
          expect(family.remotePath.startsWith("/")).toBe(true);
          expect(family.distributionPath.startsWith("/")).toBe(true);
          if (family.publicationPath !== null) {
            expect(family.publicationPath.startsWith("/")).toBe(true);
          }
          for (const endpoint of family.contentEndpoints) {
            expect(endpoint.path.startsWith("/")).toBe(true);
          }
        }
      })
    );
  });
});
