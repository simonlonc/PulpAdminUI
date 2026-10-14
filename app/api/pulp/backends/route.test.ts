import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/pulp/backends/route";

describe("GET /api/pulp/backends", () => {
  let directory: string;
  let file: string;

  function backend(id: string, label: string) {
    return {
      id,
      label,
      baseUrl: `http://${id}.internal.test/pulp/api/v3`,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
  }

  beforeEach(async () => {
    // The corrupt-file failure is logged at error level; keep that line out of the test output.
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
    vi.stubEnv("PULP_PROJECT_NAME", "My Pulp");
    directory = await mkdtemp(join(tmpdir(), "pulp-backends-route-test-"));
    file = join(directory, "pulp-backends.json");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("lists the server from PULP_BASE_URL when there is no list file", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: "default", label: "My Pulp" }]);
  });

  it("lists every server in order with only its id and label, never where it is", async () => {
    await writeFile(file, JSON.stringify([backend("a", "Alpha"), backend("b", "Bravo")]));
    vi.stubEnv("PULP_BACKENDS_FILE", file);

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual([
      { id: "a", label: "Alpha" },
      { id: "b", label: "Bravo" },
    ]);
    expect(body).not.toContain("internal.test");
    expect(body).not.toContain("baseUrl");
    expect(body).not.toContain("createdAt");
  });

  it("responds 500 without naming the file when the server list is corrupt", async () => {
    await writeFile(file, "{ not json");
    vi.stubEnv("PULP_BACKENDS_FILE", file);

    const response = await GET();

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ detail: "The Pulp server list cannot be read." });
    expect(body).not.toContain(directory);
  });
});
