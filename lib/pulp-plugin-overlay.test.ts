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
    expect(await loadPulpPluginOverlay()).toEqual([]);
  });
});
