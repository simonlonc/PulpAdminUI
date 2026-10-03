import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logStartupConfig } from "@/lib/startup-log";

let lines: string[] = [];

beforeEach(() => {
  lines = [];
  vi.stubEnv("LOG_LEVEL", "info");
  vi.stubEnv("PULP_BASE_URL", "https://svc-user:svc-pw@pulp.example.test:8443/pulp/api/v3/");
  vi.stubEnv("PULP_PROJECT_NAME", "Test Project");
  vi.stubEnv("PULP_SESSION_SECRET", "recognizable-secret-value-123");
  vi.stubEnv("PULP_CONTENT_ORIGIN", undefined);
  vi.stubEnv("PULP_PLUGIN_DIR", undefined);
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("logStartupConfig", () => {
  it("writes one info line with the configuration", () => {
    vi.stubEnv("PULP_CONTENT_ORIGIN", "https://content.example.test/ignored");
    vi.stubEnv("PULP_PLUGIN_DIR", " /etc/pulp-plugins ");

    logStartupConfig();

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      level: "info",
      event: "server_started",
      pulp_base_url: "https://pulp.example.test:8443/pulp/api/v3",
      project_name: "Test Project",
      session_secret_set: true,
      log_level: "info",
      content_origin: "https://content.example.test",
      plugin_dir: "/etc/pulp-plugins",
      dashboard_cache: expect.stringMatching(/\.next[\\/]cache$/),
      dashboard_cache_writable: expect.any(Boolean),
    });
  });

  it("reports unset settings as null and an unset secret as false", () => {
    vi.stubEnv("PULP_BASE_URL", undefined);
    vi.stubEnv("PULP_PROJECT_NAME", undefined);
    vi.stubEnv("PULP_SESSION_SECRET", "  ");

    logStartupConfig();

    expect(JSON.parse(lines[0])).toMatchObject({
      pulp_base_url: null,
      project_name: null,
      session_secret_set: false,
      content_origin: null,
      plugin_dir: null,
    });
  });

  it("never writes the session secret or the userinfo of the base URL", () => {
    logStartupConfig();

    expect(lines.join("")).not.toContain("recognizable-secret-value-123");
    expect(lines.join("")).not.toContain("svc-user");
    expect(lines.join("")).not.toContain("svc-pw");
    expect(JSON.parse(lines[0]).session_secret_set).toBe(true);
  });
});
