import { describe, expect, it } from "vitest";

import { parsePulpResourceRef } from "@/lib/pulp-resource-ref";

describe("parsePulpResourceRef", () => {
  it("roots a dot-segment-prefixed relative href instead of returning it unrooted (F-10)", () => {
    // Repro: parsePulpResourceRef("..//pulp/api/v3/") previously returned
    // { kind: "href", href: "..//pulp/api/v3/" } unchanged -- not rooted, even though the doc
    // comment promises a "relative, trailing-slash path" and every consumer treats it as rooted.
    expect(parsePulpResourceRef("..//pulp/api/v3/")).toEqual({
      kind: "href",
      href: "/pulp/api/v3/",
    });
  });
});
