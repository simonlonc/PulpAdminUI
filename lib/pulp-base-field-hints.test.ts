import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getBaseFieldHint, PULP_PLUGINS, type PulpPluginDescriptor } from "@/lib/pulp-plugins";
import { pulpDefaultHint } from "@/lib/pulp-plugin-derive";

describe("pulpDefaultHint", () => {
  it("takes a default stated as 'the default value (N)' from the description", () => {
    const hint = pulpDefaultHint({
      type: "integer",
      description:
        "Maximum number of retry attempts after a download failure. If not set then the default value (3) will be used.",
      nullable: true,
    });
    expect(hint).toEqual({ placeholder: "Pulp default (3)" });
  });

  it("takes a default stated as 'default is N'", () => {
    expect(pulpDefaultHint({ description: "Retries. The default is 5." }).placeholder).toBe("Pulp default (5)");
    expect(pulpDefaultHint({ description: "Ratio, default is 0.5 unless set" }).placeholder).toBe(
      "Pulp default (0.5)"
    );
  });

  it("says plain 'Pulp default' when the description names no number", () => {
    expect(
      pulpDefaultHint({
        description: "Total number of simultaneous connections. If not set then the default value will be used.",
        minimum: 1,
      })
    ).toEqual({ placeholder: "Pulp default", minimum: 1 });
    expect(pulpDefaultHint({ description: "Limits requests per second for each concurrent downloader" })).toEqual({
      placeholder: "Pulp default",
    });
  });

  it("does not read a number out of 'default is null' or an unrelated number", () => {
    expect(
      pulpDefaultHint({
        description:
          "aiohttp.ClientTimeout.connect (q.v.) for download-connections. The default is null, which will cause the default from the aiohttp library to be used.",
        minimum: 0.0,
      })
    ).toEqual({ placeholder: "Pulp default", minimum: 0 });
    expect(
      pulpDefaultHint({ description: "Retain X versions of the repository. Default is null which retains all versions." })
        .placeholder
    ).toBe("Pulp default");
    expect(pulpDefaultHint({ description: "Retain 3 versions; the default is 3x" }).placeholder).toBe("Pulp default");
  });

  it("passes a spec default through as the real control state, and ignores a null one", () => {
    expect(pulpDefaultHint({ type: "boolean", description: "Whether to show it.", default: false })).toEqual({
      placeholder: "Pulp default",
      default: false,
    });
    expect(pulpDefaultHint({ default: null }).default).toBeUndefined();
  });

  it("copes with a missing or malformed property", () => {
    for (const value of [undefined, null, "x", 3, [], { description: 4, minimum: "1" }]) {
      expect(pulpDefaultHint(value)).toEqual({ placeholder: "Pulp default" });
    }
  });
});

describe("getBaseFieldHint", () => {
  it("falls back to a bare 'Pulp default' with no minimum for the static seed", () => {
    for (const plugin of PULP_PLUGINS) {
      expect(getBaseFieldHint(plugin, "max_retries")).toEqual({ placeholder: "Pulp default" });
    }
  });

  it("returns the derived hint when the descriptor carries one", () => {
    const plugin: PulpPluginDescriptor = {
      ...PULP_PLUGINS[0],
      baseFieldHints: { max_retries: { placeholder: "Pulp default (3)" } },
    };
    expect(getBaseFieldHint(plugin, "max_retries").placeholder).toBe("Pulp default (3)");
    expect(getBaseFieldHint(plugin, "rate_limit").placeholder).toBe("Pulp default");
  });
});

describe("no invented defaults in source", () => {
  // Fields whose schema has no `default`: any number shown as their default must come from the
  // spec description at derive time (pulpDefaultHint), never from a literal in these files.
  const files = [
    "components/pulp/remote-form-modal.tsx",
    "components/pulp/repository-create-modal.tsx",
    "components/pulp/repository-edit-deb-form.tsx",
    "components/pulp/repository-edit-file-form.tsx",
    "components/pulp/repository-edit-rpm-form.tsx",
    "components/pulp/distribution-create-modal.tsx",
    "components/pulp/distribution-edit-modal.tsx",
    "lib/remote-form.ts",
    "lib/repository-edit-form.ts",
  ];

  for (const file of files) {
    const source = readFileSync(file, "utf8");

    it(`${file} has no 'Pulp default (N)' literal`, () => {
      expect(source).not.toMatch(/Pulp default \(\d/);
    });

    it(`${file} has no numeric placeholder literal`, () => {
      expect(source).not.toMatch(/placeholder=(?:"\d|\{"\d|\{\d)/);
      expect(source).not.toMatch(/placeholder:\s*["']?\d/);
    });
  }
});
