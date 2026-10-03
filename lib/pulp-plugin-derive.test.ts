import { describe, expect, it } from "vitest";

import {
  KNOWN_UNRENDERED_REMOTE_BASE_FIELDS,
  KNOWN_UNRENDERED_REPOSITORY_BASE_FIELDS,
  RENDERED_REMOTE_BASE_FIELDS,
  RENDERED_REPOSITORY_BASE_FIELDS,
  derivedExcludedBaseFields,
  derivePulpPlugins,
} from "@/lib/pulp-plugin-derive";

/**
 * A small hand-built OpenAPI-shaped fixture covering:
 * - "alpha": a full family (repository, remote, publication, distribution, one content
 *   endpoint, sync).
 * - "beta": has a repository and remote, but no distribution path, so it must be skipped.
 * - "delta": a family with several content endpoints, no publication and no sync path.
 * - "core"/"nopost": repository paths that must never surface as families (the core app
 *   itself, and a repository with no POST operation).
 */
const spec = {
  paths: {
    "/pulp/api/v3/repositories/core/core/": { get: {} },
    "/pulp/api/v3/repositories/nopost/nopost/": { get: {} },

    "/pulp/api/v3/repositories/alpha/alpha/": {
      post: {
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/AlphaRepository" } } },
        },
      },
    },
    "/pulp/api/v3/repositories/beta/beta/": {
      post: {
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/BetaRepository" } } },
        },
      },
    },
    "/pulp/api/v3/repositories/delta/delta/": {
      post: {
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/DeltaRepository" } } },
        },
      },
    },

    "/pulp/api/v3/remotes/alpha/alpha/": {
      post: {
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/AlphaRemote" } } },
        },
      },
    },
    "/pulp/api/v3/remotes/beta/beta/": {
      post: {
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/BetaRemote" } } },
        },
      },
    },
    "/pulp/api/v3/remotes/delta/delta/": {
      post: {
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/DeltaRemote" } } },
        },
      },
    },

    "/pulp/api/v3/publications/alpha/alpha/": {},
    "/pulp/api/v3/distributions/alpha/alpha/": {},
    "/pulp/api/v3/distributions/delta/delta/": {},

    "/pulp/api/v3/content/alpha/unit/": {
      get: {
        responses: {
          "200": {
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/PaginatedAlphaContentResponseList" } },
            },
          },
        },
      },
    },
    "/pulp/api/v3/content/delta/typeA/": {
      get: {
        responses: {
          "200": {
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/PaginatedDeltaTypeAResponseList" } },
            },
          },
        },
      },
    },
    "/pulp/api/v3/content/delta/typeB/": {
      get: {
        responses: {
          "200": {
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/PaginatedDeltaTypeBResponseList" } },
            },
          },
        },
      },
    },
    "/pulp/api/v3/content/": {
      get: {
        parameters: [{ name: "pulp_type", schema: { enum: ["alpha.unit", "file.file"] } }],
      },
    },

    "{alpha_alpha_repository_href}sync/": {
      post: {
        requestBody: {
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/AlphaRepositorySyncURL" } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      AlphaRepository: {
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          alpha_only_field: { type: "boolean" },
        },
        required: ["name"],
      },
      BetaRepository: {
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          beta_only_field: { type: "boolean" },
        },
        required: ["name"],
      },
      DeltaRepository: {
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          delta_only_field: { type: "boolean" },
        },
        required: ["name"],
      },
      AlphaRemote: {
        properties: {
          url: { type: "string" },
          policy: { type: "string" },
          alpha_remote_field: { type: "boolean" },
          alpha_timeout: { type: "number", minimum: 0.0 },
          alpha_count: { type: "integer", minimum: 1 },
          alpha_free: { type: "integer" },
        },
        required: ["url", "alpha_remote_field"],
      },
      BetaRemote: {
        properties: {
          url: { type: "string" },
          policy: { type: "string" },
          beta_remote_field: { type: "boolean" },
        },
        required: ["url"],
      },
      DeltaRemote: {
        properties: {
          url: { type: "string" },
          policy: { type: "string" },
          delta_remote_field: { type: "array", items: { type: "string", enum: ["x", "y"] } },
        },
        required: ["url"],
      },
      AlphaRepositorySyncURL: {
        properties: {
          remote: { type: "string" },
          mirror: { type: "boolean" },
          optimize: { type: "boolean" },
        },
      },
      PaginatedAlphaContentResponseList: {
        properties: { results: { items: { $ref: "#/components/schemas/AlphaContentResponse" } } },
      },
      AlphaContentResponse: {
        properties: {
          name: { type: "string" },
          size: { type: "integer" },
          pulp_href: { type: "string" },
        },
      },
      PaginatedDeltaTypeAResponseList: {
        properties: { results: { items: { $ref: "#/components/schemas/DeltaTypeAContentResponse" } } },
      },
      DeltaTypeAContentResponse: {
        properties: {
          name: { type: "string" },
          version: { type: "string" },
          pulp_href: { type: "string" },
        },
      },
      PaginatedDeltaTypeBResponseList: {
        properties: { results: { items: { $ref: "#/components/schemas/DeltaTypeBContentResponse" } } },
      },
      DeltaTypeBContentResponse: {
        properties: {
          name: { type: "string" },
          pulp_href: { type: "string" },
          artifact: { type: "string" },
        },
      },
    },
  },
};

describe("derivePulpPlugins", () => {
  it("returns an empty array when the spec has no paths", () => {
    expect(derivePulpPlugins({})).toEqual([]);
    expect(derivePulpPlugins({ paths: {} })).toEqual([]);
    expect(derivePulpPlugins(null)).toEqual([]);
    expect(derivePulpPlugins("not a spec")).toEqual([]);
  });

  it("skips the core app and a repository with no POST operation, and skips a family with no distribution path", () => {
    const kinds = derivePulpPlugins(spec).map((family) => family.kind);
    expect(kinds).toEqual(["alpha", "delta"]);
  });

  it("derives a full family from every path", () => {
    const alpha = derivePulpPlugins(spec).find((family) => family.kind === "alpha");
    expect(alpha).toBeDefined();
    expect(alpha?.label).toBe("Alpha");
    expect(alpha?.article).toBe("an");
    expect(alpha?.repositoryPath).toBe("/repositories/alpha/alpha/");
    expect(alpha?.remotePath).toBe("/remotes/alpha/alpha/");
    expect(alpha?.publicationPath).toBe("/publications/alpha/alpha/");
    expect(alpha?.distributionPath).toBe("/distributions/alpha/alpha/");
    expect(alpha?.supportsPublish).toBe(true);
    expect(alpha?.supportsSync).toBe(true);
    expect(alpha?.syncFields).toEqual([
      { name: "mirror", type: "boolean", label: "Mirror", default: false },
      { name: "optimize", type: "boolean", label: "Optimize", default: false },
    ]);
    expect(alpha?.extraRepoFields).toEqual(["alpha_only_field"]);
    expect(alpha?.extraRemoteFields).toEqual([
      { name: "alpha_count", type: "integer", label: "Alpha Count", minimum: 1 },
      { name: "alpha_free", type: "integer", label: "Alpha Free" },
      { name: "alpha_remote_field", type: "boolean", label: "Alpha Remote Field", required: true },
      { name: "alpha_timeout", type: "float", label: "Alpha Timeout", minimum: 0 },
    ]);
  });

  it("derives one content endpoint with an unambiguous content type", () => {
    const alpha = derivePulpPlugins(spec).find((family) => family.kind === "alpha");
    expect(alpha?.contentEndpoints).toEqual([
      {
        path: "/content/alpha/unit/",
        label: "Unit",
        contentType: "alpha.unit",
        fields: [
          { name: "name", label: "Name" },
          { name: "size", label: "Size" },
        ],
        sizeField: "size",
      },
    ]);
  });

  it("derives several content endpoints, sorted by path, with an ambiguous content type left blank", () => {
    const delta = derivePulpPlugins(spec).find((family) => family.kind === "delta");
    expect(delta).toBeDefined();
    expect(delta?.publicationPath).toBeNull();
    expect(delta?.supportsPublish).toBe(false);
    expect(delta?.supportsSync).toBe(false);
    expect(delta?.extraRepoFields).toEqual(["delta_only_field"]);
    expect(delta?.extraRemoteFields).toEqual([
      { name: "delta_remote_field", type: "string_list", label: "Delta Remote Field", options: ["x", "y"] },
    ]);
    expect(delta?.contentEndpoints).toEqual([
      {
        path: "/content/delta/typeA/",
        label: "TypeA",
        contentType: "",
        fields: [
          { name: "name", label: "Name" },
          { name: "version", label: "Version" },
        ],
      },
      {
        path: "/content/delta/typeB/",
        label: "TypeB",
        contentType: "",
        fields: [{ name: "name", label: "Name" }],
      },
    ]);
  });

  describe("base field coverage", () => {
    // The committed openapi/pulp.json is domain-prefixed, which the deriver does not match, so
    // the real spec is checked in the contract tier; here a fixture whose base fields are
    // exactly the declared lists proves the check passes and names a newly added field.
    function specWithBase(resource: "remotes" | "repositories", base: string[]) {
      const properties = (names: string[]) => Object.fromEntries(names.map((n) => [n, { type: "string" }]));
      const paths: Record<string, unknown> = {};
      const schemas: Record<string, unknown> = {};
      for (const type of ["one", "two"]) {
        const name = `${type}${resource}`;
        paths[`/pulp/api/v3/${resource}/${type}/${type}/`] = {
          post: {
            requestBody: {
              content: { "application/json": { schema: { $ref: `#/components/schemas/${name}` } } },
            },
          },
        };
        schemas[name] = { properties: properties([...base, `${type}_only`]) };
      }
      return { paths, components: { schemas } };
    }

    const cases = [
      {
        resource: "remote",
        specResource: "remotes",
        rendered: RENDERED_REMOTE_BASE_FIELDS,
        gaps: KNOWN_UNRENDERED_REMOTE_BASE_FIELDS,
        // policy is excluded by hand, not computed, so it is not part of the fixture's base
        base: (list: readonly string[]) => list.filter((n) => n !== "policy"),
      },
      {
        resource: "repository",
        specResource: "repositories",
        rendered: RENDERED_REPOSITORY_BASE_FIELDS,
        gaps: KNOWN_UNRENDERED_REPOSITORY_BASE_FIELDS,
        base: (list: readonly string[]) => [...list],
      },
    ] as const;

    for (const { resource, specResource, rendered, gaps, base } of cases) {
      const unaccounted = (spec: unknown) =>
        [...derivedExcludedBaseFields(spec)[resource]].filter(
          (n) => !rendered.includes(n) && !gaps.includes(n)
        );

      it(`accepts ${resource} base fields that are all rendered or known gaps`, () => {
        const spec = specWithBase(specResource, base([...rendered, ...gaps]));
        expect(unaccounted(spec), `${resource} base fields dropped by the deriver and not rendered`).toEqual([]);
      });

      it(`names a ${resource} base field that is neither rendered nor a known gap`, () => {
        const spec = specWithBase(specResource, base([...rendered, ...gaps, "brand_new_field"]));
        expect(unaccounted(spec)).toEqual(["brand_new_field"]);
      });

      it(`lists no ${resource} known gap that is also rendered`, () => {
        const both = gaps.filter((n) => rendered.includes(n));
        expect(both, `${resource} fields in both the rendered and known-gap lists`).toEqual([]);
      });
    }
  });
});
