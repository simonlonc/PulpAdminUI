import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isCompleteDescriptor, loadPulpPluginOverlay } from "@/lib/pulp-plugin-overlay";
import type { PulpPluginDescriptor } from "@/lib/pulp-plugins";

const completeDescriptor: PulpPluginDescriptor = {
  kind: "widget",
  label: "Widget",
  article: "a",
  repositoryPath: "/repositories/widget/widget/",
  remotePath: "/remotes/widget/widget/",
  remoteUrlPlaceholder: "https://",
  publicationPath: null,
  distributionPath: "/distributions/widget/widget/",
  contentEndpoints: [],
  supportsPublish: false,
  supportsSync: false,
  syncFields: [],
  extraRemoteFields: [],
  extraRepoFields: [],
};

describe("isCompleteDescriptor", () => {
  it("accepts an entry carrying every required key, including a null publicationPath", () => {
    expect(isCompleteDescriptor(completeDescriptor)).toBe(true);
  });

  it("rejects an entry missing a required key", () => {
    const missingKind: Partial<PulpPluginDescriptor> = {
      label: "Widget",
      article: "a",
      repositoryPath: "/repositories/widget/widget/",
      remotePath: "/remotes/widget/widget/",
      remoteUrlPlaceholder: "https://",
      publicationPath: null,
      distributionPath: "/distributions/widget/widget/",
      contentEndpoints: [],
      supportsPublish: false,
      supportsSync: false,
      syncFields: [],
      extraRemoteFields: [],
      extraRepoFields: [],
    };
    expect(isCompleteDescriptor(missingKind)).toBe(false);
  });

  it("rejects an empty entry", () => {
    expect(isCompleteDescriptor({})).toBe(false);
  });
});

describe("loadPulpPluginOverlay", () => {
  beforeEach(() => {
    vi.stubEnv("PULP_PLUGIN_DIR", undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns no entries when PULP_PLUGIN_DIR is unset", async () => {
    expect(await loadPulpPluginOverlay()).toEqual([]);
  });

  it("returns no entries when PULP_PLUGIN_DIR is blank", async () => {
    vi.stubEnv("PULP_PLUGIN_DIR", "   ");
    expect(await loadPulpPluginOverlay()).toEqual([]);
  });

  it("returns no entries when the directory does not exist", async () => {
    vi.stubEnv("PULP_PLUGIN_DIR", "/nonexistent/pulp-plugin-overlay-test-dir");
    // An unreadable directory logs at error, which the test LOG_LEVEL still writes.
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    expect(await loadPulpPluginOverlay()).toEqual([]);
  });

  describe("diagnostics", () => {
    let lines: string[] = [];
    let directory: string;

    beforeEach(async () => {
      lines = [];
      vi.stubEnv("LOG_LEVEL", "info");
      vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
        lines.push(String(chunk));
        return true;
      });
      directory = await mkdtemp(join(tmpdir(), "pulp-plugin-overlay-test-"));
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await rm(directory, { recursive: true, force: true });
    });

    const logged = () => lines.map((line) => JSON.parse(line));

    it("logs an error when the directory cannot be read", async () => {
      vi.stubEnv("PULP_PLUGIN_DIR", join(directory, "missing"));
      await loadPulpPluginOverlay();

      expect(logged()).toEqual([
        expect.objectContaining({
          level: "error",
          event: "plugin_overlay_dir_unreadable",
          directory: join(directory, "missing"),
          message: expect.stringContaining("ENOENT"),
        }),
      ]);
    });

    it("warns about a file that is not JSON and one that is not a valid entry", async () => {
      await writeFile(join(directory, "a.json"), "{not json");
      await writeFile(join(directory, "b.json"), JSON.stringify({ kind: "widget", bogus: 1 }));
      await writeFile(join(directory, "c.json"), JSON.stringify([]));
      vi.stubEnv("PULP_PLUGIN_DIR", directory);
      await loadPulpPluginOverlay();

      expect(logged()).toEqual([
        expect.objectContaining({
          level: "warn",
          event: "plugin_overlay_file_unreadable",
          file: join(directory, "a.json"),
        }),
        expect.objectContaining({
          level: "warn",
          event: "plugin_overlay_keys_ignored",
          file: join(directory, "b.json"),
          keys: "bogus",
        }),
        expect.objectContaining({
          level: "warn",
          event: "plugin_overlay_entry_invalid",
          file: join(directory, "c.json"),
        }),
      ]);
    });

    it("warns when a later file replaces an earlier entry for the same kind", async () => {
      await writeFile(join(directory, "a.json"), JSON.stringify({ kind: "widget" }));
      await writeFile(join(directory, "b.json"), JSON.stringify({ kind: "widget" }));
      vi.stubEnv("PULP_PLUGIN_DIR", directory);
      await loadPulpPluginOverlay();

      expect(logged()).toEqual([
        expect.objectContaining({
          level: "warn",
          event: "plugin_overlay_kind_replaced",
          file: join(directory, "b.json"),
          kind: "widget",
        }),
      ]);
    });
  });
});
