/**
 * Fuzz properties for lib/pulp-resource-ref.ts (parsePulpResourceRef,
 * pulpListPathForPrn). Pins F-10: the doc comment on parsePulpResourceRef
 * promises a href "normalised to a relative, trailing-slash path", and every
 * consumer (e.g. app/api/pulp/resolve/route.ts:42, which hands it straight to
 * normalizePulpHrefToApiPath) treats the result as rooted -- but a dot-segment
 * prefix like "..//pulp/api/v3/" survives normalisation unrooted.
 *
 * This tier only runs under `npm run fuzz` (see vitest.fuzz.config.ts); it is
 * excluded from `npm test`.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parsePulpResourceRef, pulpListPathForPrn } from "@/lib/pulp-resource-ref";
import { pulpHref } from "@/test/fuzz/arbitraries";

const PULP_API_MARKER = "/pulp/api/v3/";

// The full set of list paths pulpListPathForPrn can return, as data read off
// the module (not by re-deriving which prn maps to which path -- that would
// reimplement the switch itself as the oracle).
const KNOWN_PRN_LIST_PATHS = [
  "/tasks/",
  "/task-schedules/",
  "/users/",
  "/groups/",
  "/roles/",
  "/workers/",
  "/repository_versions/",
  "/repositories/",
  "/remotes/",
  "/distributions/",
  "/publications/",
  "/contentguards/",
  "/content/",
];

// A representative app_label.model for each branch of pulpListPathForPrn's
// switch/suffix rules, paired with a real uuid, so the "known path" property
// actually exercises more than the immediate-null case.
const prnLike = fc
  .tuple(
    fc.constantFrom(
      "core.task",
      "core.taskschedule",
      "auth.user",
      "core.group",
      "core.role",
      "core.appstatus",
      "rpm.rpmrepositoryversion",
      "rpm.rpmrepository",
      "rpm.rpmremote",
      "rpm.rpmdistribution",
      "rpm.rpmpublication",
      "core.contentguard",
      "certguard.rhsmcertguard",
      "rpm.package"
    ),
    fc.uuid()
  )
  .map(([appLabelModel, id]) => `prn:${appLabelModel}:${id}`);

describe("parsePulpResourceRef", () => {
  it("F-10: href results are rooted, trailing-slash paths containing the API marker", () => {
    // Counterexample: parsePulpResourceRef("..//pulp/api/v3/") returns
    // { kind: "href", href: "..//pulp/api/v3/" } -- ends with "/" and contains
    // the marker, but does not start with "/".
    fc.assert(
      fc.property(pulpHref(), (input) => {
        const parsed = parsePulpResourceRef(input);
        fc.pre(parsed !== null && parsed.kind === "href");
        const { href } = parsed as { kind: "href"; href: string };
        expect(href.startsWith("/")).toBe(true);
        expect(href.endsWith("/")).toBe(true);
        expect(href).toContain(PULP_API_MARKER);
      }),
      { examples: [["..//pulp/api/v3/"]] }
    );
  });

  it("never throws, including on the invalid-absolute hrefs that make new URL() throw", () => {
    fc.assert(
      fc.property(pulpHref(), (input) => {
        expect(() => parsePulpResourceRef(input)).not.toThrow();
      })
    );
  });
});

describe("pulpListPathForPrn", () => {
  it("returns null or a known list path, and never throws, for any string", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), prnLike), (input) => {
        let result: string | null = null;
        expect(() => {
          result = pulpListPathForPrn(input);
        }).not.toThrow();
        if (result !== null) {
          expect(KNOWN_PRN_LIST_PATHS).toContain(result);
        }
      })
    );
  });

  it("never throws on the invalid-absolute hrefs that make new URL() throw", () => {
    fc.assert(
      fc.property(pulpHref(), (input) => {
        expect(() => pulpListPathForPrn(input)).not.toThrow();
      })
    );
  });
});
