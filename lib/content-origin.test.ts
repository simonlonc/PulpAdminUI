import { afterEach, describe, expect, it, vi } from "vitest";

import { applyContentOrigin, getContentOriginOverride } from "@/lib/content-origin";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getContentOriginOverride", () => {
  it("returns null when PULP_CONTENT_ORIGIN is unset", () => {
    expect(getContentOriginOverride()).toBeNull();
  });

  it("returns null when PULP_CONTENT_ORIGIN is blank", () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "   ");
    expect(getContentOriginOverride()).toBeNull();
  });

  it("returns the normalised origin for a valid http(s) value", () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "https://pulp.example.com");
    expect(getContentOriginOverride()).toBe("https://pulp.example.com");
  });

  it("discards any path in the value, keeping only the origin", () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "https://pulp.example.com/ignored/");
    expect(getContentOriginOverride()).toBe("https://pulp.example.com");
  });

  it("returns null and does not throw for a malformed value", () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "not a url");
    expect(() => getContentOriginOverride()).not.toThrow();
    expect(getContentOriginOverride()).toBeNull();
  });

  it("returns null for a non-http(s) scheme", () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "ftp://host");
    expect(getContentOriginOverride()).toBeNull();
  });
});

describe("applyContentOrigin", () => {
  it("returns the url byte-identical when PULP_CONTENT_ORIGIN is unset", () => {
    const url = "http://lenovo-ideapad-gaming-3:8080/pulp/content/my-repo/";
    expect(applyContentOrigin(url)).toBe(url);
  });

  it("returns the url byte-identical when PULP_CONTENT_ORIGIN is blank", () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "   ");
    const url = "http://lenovo-ideapad-gaming-3:8080/pulp/content/my-repo/";
    expect(applyContentOrigin(url)).toBe(url);
  });

  it("replaces the origin while preserving path, query and hash", () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "https://pulp.example.com");
    expect(
      applyContentOrigin("http://lenovo-ideapad-gaming-3:8080/pulp/content/my-repo/")
    ).toBe("https://pulp.example.com/pulp/content/my-repo/");
    expect(
      applyContentOrigin("http://lenovo-ideapad-gaming-3:8080/pulp/content/my-repo/?arch=x86_64#top")
    ).toBe("https://pulp.example.com/pulp/content/my-repo/?arch=x86_64#top");
  });

  it("uses only the origin when the override value carries a path", () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "https://pulp.example.com/ignored/");
    expect(
      applyContentOrigin("http://lenovo-ideapad-gaming-3:8080/pulp/content/my-repo/")
    ).toBe("https://pulp.example.com/pulp/content/my-repo/");
  });

  it("returns Pulp's value unchanged and does not throw for a malformed override", () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "not a url");
    const url = "http://lenovo-ideapad-gaming-3:8080/pulp/content/my-repo/";
    expect(() => applyContentOrigin(url)).not.toThrow();
    expect(applyContentOrigin(url)).toBe(url);
  });

  it("ignores a non-http(s) override scheme, leaving the value unchanged", () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "ftp://host");
    const url = "http://lenovo-ideapad-gaming-3:8080/pulp/content/my-repo/";
    expect(applyContentOrigin(url)).toBe(url);
  });

  it("returns null for a null input", () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "https://pulp.example.com");
    expect(applyContentOrigin(null)).toBeNull();
  });

  it("returns null for an undefined input", () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "https://pulp.example.com");
    expect(applyContentOrigin(undefined)).toBeNull();
  });

  it("returns a relative url unchanged and does not throw", () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "https://pulp.example.com");
    const relative = "/pulp/content/my-repo/";
    expect(() => applyContentOrigin(relative)).not.toThrow();
    expect(applyContentOrigin(relative)).toBe(relative);
  });
});
