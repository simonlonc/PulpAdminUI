/**
 * Fuzz properties for lib/pulp-task-result.ts (hrefFromCreatedResource,
 * resolvePublicationHrefAfterTask, isPulpTaskFinished, pulpTaskFailureMessage).
 * All four are pinned as never-throwing on any value inhabiting their
 * parameter type.
 *
 * F-12 (recorded, not scheduled for a fix): resolvePublicationHrefAfterTask(null as never, null)
 * throws, but `null` is not in the parameter type, so it is deliberately not
 * generated here -- doing so would be the hygiene-rule-3 violation ("generated
 * values must inhabit the declared type") that produced two of the
 * exploratory run's false findings.
 *
 * This tier only runs under `npm run fuzz` (see vitest.fuzz.config.ts); it is
 * excluded from `npm test`.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  hrefFromCreatedResource,
  isPulpTaskFinished,
  pulpTaskFailureMessage,
  resolvePublicationHrefAfterTask,
  type CreatedResourceEntry,
} from "@/lib/pulp-task-result";
import { pulpTask } from "@/test/fuzz/arbitraries";

const createdResourceEntry: fc.Arbitrary<CreatedResourceEntry> = fc.oneof(
  fc.string(),
  fc.record({ pulp_href: fc.string() }),
  fc.record({ href: fc.string() })
);

describe("hrefFromCreatedResource", () => {
  it("never throws, including for undefined", () => {
    fc.assert(
      fc.property(fc.option(createdResourceEntry, { nil: undefined }), (entry) => {
        expect(() => hrefFromCreatedResource(entry)).not.toThrow();
      })
    );
  });
});

describe("resolvePublicationHrefAfterTask", () => {
  it("never throws for any TaskResponse-shaped task and any fallback", () => {
    fc.assert(
      fc.property(pulpTask(), fc.oneof(fc.string(), fc.constant(null)), (task, fallback) => {
        expect(() => resolvePublicationHrefAfterTask(task, fallback)).not.toThrow();
      })
    );
  });
});

describe("isPulpTaskFinished", () => {
  it("never throws for any string or undefined", () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: undefined }), (state) => {
        expect(() => isPulpTaskFinished(state)).not.toThrow();
      })
    );
  });
});

describe("pulpTaskFailureMessage", () => {
  it("never throws for any state/error pair inhabiting the parameter type", () => {
    fc.assert(
      fc.property(
        fc.record(
          { state: fc.string(), error: fc.jsonValue() },
          { requiredKeys: [] }
        ),
        (task) => {
          expect(() => pulpTaskFailureMessage(task)).not.toThrow();
        }
      )
    );
  });
});
