/**
 * Fuzz properties for lib/remote-form.ts (parseConcurrency,
 * parseNullableInteger, formToCreatePayload). Pins F-9: both parsers accept
 * any finite, >= 1 (or, for parseNullableInteger, any finite) numeric string
 * without checking Number.isSafeInteger, so an unreasonably long digit string
 * -- something a text input genuinely allows -- comes out as an imprecise
 * float that Math.trunc leaves unchanged, and is then sent to Pulp as
 * download_concurrency.
 *
 * This tier only runs under `npm run fuzz` (see vitest.fuzz.config.ts); it is
 * excluded from `npm test`.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { PulpPluginDescriptor } from "@/lib/pulp-plugins";
import {
  emptyRemoteForm,
  formToCreatePayload,
  invalidJsonExtraField,
  parseConcurrency,
  parseNullableInteger,
  type RemoteFormState,
} from "@/lib/remote-form";

// Reuses the minimal-descriptor shape from lib/remote-form.test.ts rather than
// inventing a new fixture.
const baseDescriptor: Omit<PulpPluginDescriptor, "extraRemoteFields"> = {
  kind: "widget",
  label: "Widget",
  article: "a",
  repositoryPath: "/repositories/widget/widget/",
  remotePath: "/remotes/widget/widget/",
  remoteUrlPlaceholder: "https://example.com/widgets/",
  publicationPath: null,
  distributionPath: "/distributions/widget/widget/",
  contentEndpoints: [],
  supportsPublish: false,
  supportsSync: false,
  syncFields: [],
  extraRepoFields: [],
};

const jsonFieldPlugin: PulpPluginDescriptor = {
  ...baseDescriptor,
  extraRemoteFields: [{ name: "includes", type: "json", label: "Includes" }],
};

// Blank, whitespace, or JSON.stringify of an arbitrary JSON value (an
// independent authority for "valid JSON text"), plus arbitrary strings so the
// mostly-invalid case is covered too and fc.pre has something to filter.
const jsonExtraFieldText = fc.oneof(
  fc.constant(""),
  fc.constant("   "),
  fc.jsonValue().map((value) => JSON.stringify(value)),
  fc.string()
);

describe("parseConcurrency", () => {
  it("F-9: returns null or a safe integer >= 1, for any string", () => {
    // Counterexample: "9".repeat(56) -> Number("999...9") = 1e+56, which is finite,
    // >= 1, and unchanged by Math.trunc, but not a safe integer.
    fc.assert(
      fc.property(fc.string(), (value) => {
        const result = parseConcurrency(value);
        if (result !== null) {
          expect(Number.isSafeInteger(result)).toBe(true);
          expect(result).toBeGreaterThanOrEqual(1);
        }
      }),
      { examples: [["9".repeat(56)]] }
    );
  });
});

describe("parseNullableInteger", () => {
  it("F-9: returns null or a safe integer, for any string", () => {
    // Same underlying defect as parseConcurrency: no Number.isSafeInteger check.
    fc.assert(
      fc.property(fc.string(), (value) => {
        const result = parseNullableInteger(value);
        if (result !== null) {
          expect(Number.isSafeInteger(result)).toBe(true);
        }
      }),
      { examples: [["9".repeat(56)]] }
    );
  });
});

describe("formToCreatePayload", () => {
  it("never throws once invalidJsonExtraField returns null", () => {
    // formToCreatePayload's JSON.parse on a "json" extra field is unguarded by design
    // (the caller is expected to check invalidJsonExtraField first); pin that contract
    // with fc.pre rather than fuzzing past it.
    fc.assert(
      fc.property(jsonExtraFieldText, (jsonText) => {
        const form: RemoteFormState = {
          ...emptyRemoteForm(jsonFieldPlugin),
          extra: { includes: jsonText },
        };
        fc.pre(invalidJsonExtraField(form, jsonFieldPlugin) === null);
        expect(() => formToCreatePayload(form, jsonFieldPlugin)).not.toThrow();
      })
    );
  });
});
