import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addPulpBackend,
  DEFAULT_PULP_BACKEND_ID,
  getPulpBackend,
  listPulpBackends,
  removePulpBackend,
  updatePulpBackend,
} from "@/lib/pulp-backends";

let directory: string;
let file: string;
let lines: string[] = [];

function entry(id: string) {
  return {
    id,
    label: `Server ${id}`,
    baseUrl: `https://${id}.example.test/pulp/api/v3`,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

async function stored(): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

const logged = () => lines.map((line) => JSON.parse(line));

beforeEach(async () => {
  lines = [];
  vi.stubEnv("LOG_LEVEL", "info");
  vi.stubEnv("PULP_BASE_URL", undefined);
  vi.stubEnv("PULP_PROJECT_NAME", undefined);
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  directory = await mkdtemp(join(tmpdir(), "pulp-backends-test-"));
  file = join(directory, "pulp-backends.json");
  vi.stubEnv("PULP_BACKENDS_FILE", file);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("listPulpBackends", () => {
  it("synthesizes one default entry from PULP_BASE_URL and PULP_PROJECT_NAME when the file is absent", async () => {
    vi.stubEnv("PULP_BASE_URL", " https://pulp.example.test/pulp/api/v3/ ");
    vi.stubEnv("PULP_PROJECT_NAME", " Production ");

    const backends = await listPulpBackends();

    expect(backends).toEqual([
      {
        id: DEFAULT_PULP_BACKEND_ID,
        label: "Production",
        baseUrl: "https://pulp.example.test/pulp/api/v3",
        createdAt: expect.any(String),
      },
    ]);
    expect(new Date(backends[0].createdAt).toISOString()).toBe(backends[0].createdAt);
  });

  it("labels the default entry Pulp when PULP_PROJECT_NAME is unset", async () => {
    vi.stubEnv("PULP_BASE_URL", "https://pulp.example.test/pulp/api/v3");

    expect((await listPulpBackends()).map((backend) => backend.label)).toEqual(["Pulp"]);
  });

  it("returns no backends when the file is absent and PULP_BASE_URL is unset", async () => {
    expect(await listPulpBackends()).toEqual([]);
  });

  it("falls back for an empty file, a blank file and an empty array", async () => {
    vi.stubEnv("PULP_BASE_URL", "https://pulp.example.test/pulp/api/v3");

    for (const content of ["", "  \n", "[]"]) {
      await writeFile(file, content);
      expect((await listPulpBackends()).map((backend) => backend.id)).toEqual([
        DEFAULT_PULP_BACKEND_ID,
      ]);
    }
  });

  it("reads the file in preference to PULP_BASE_URL", async () => {
    vi.stubEnv("PULP_BASE_URL", "https://env.example.test/pulp/api/v3");
    await writeFile(file, JSON.stringify([entry("one"), entry("two")]));

    expect(await listPulpBackends()).toEqual([entry("one"), entry("two")]);
  });

  it("rejects, naming the file, when the content is not valid JSON", async () => {
    vi.stubEnv("PULP_BASE_URL", "https://env.example.test/pulp/api/v3");
    await writeFile(file, "[{not json");

    await expect(listPulpBackends()).rejects.toThrow(file);
    expect(logged()).toEqual([
      expect.objectContaining({ level: "error", event: "pulp_backends_file_unusable", file }),
    ]);
  });

  it("rejects, naming the file, when the content is not an array", async () => {
    vi.stubEnv("PULP_BASE_URL", "https://env.example.test/pulp/api/v3");
    await writeFile(file, JSON.stringify(entry("one")));

    await expect(listPulpBackends()).rejects.toThrow(file);
    expect(logged()).toEqual([
      expect.objectContaining({ level: "error", event: "pulp_backends_file_unusable", file }),
    ]);
  });

  it("rejects, naming the file, when it cannot be read for a reason other than being absent", async () => {
    await mkdir(file);

    await expect(listPulpBackends()).rejects.toThrow(file);
    expect(logged()).toEqual([
      expect.objectContaining({ level: "error", event: "pulp_backends_file_unusable", file }),
    ]);
  });

  it("skips invalid entries with a warning and keeps the valid ones", async () => {
    await writeFile(
      file,
      JSON.stringify([
        entry("one"),
        "not an object",
        { ...entry("no-label"), label: "  " },
        { ...entry("bad-url"), baseUrl: "ftp://files.example.test/" },
        { ...entry("userinfo"), baseUrl: "https://admin:secret@pulp.example.test/" },
        { ...entry("no-date"), createdAt: 42 },
        { ...entry("two"), extra: "dropped" },
      ])
    );

    const backends = await listPulpBackends();

    expect(backends).toEqual([entry("one"), entry("two")]);
    expect(logged().map((line) => [line.level, line.event, line.index])).toEqual(
      [1, 2, 3, 4, 5].map((index) => ["warn", "pulp_backends_entry_invalid", index])
    );
    expect(logged()[0]).toMatchObject({ file, problem: expect.any(String) });
    // The warning says what is wrong with the entry, never what the offending URL contained.
    expect(lines.join("")).not.toContain("admin:secret");
  });

  it("does not fall back when every entry in a non-empty list is invalid", async () => {
    vi.stubEnv("PULP_BASE_URL", "https://env.example.test/pulp/api/v3");
    await writeFile(file, JSON.stringify([{ id: "one" }]));

    expect(await listPulpBackends()).toEqual([]);
  });

  it("keeps the first of two entries sharing an id and warns about the second", async () => {
    await writeFile(
      file,
      JSON.stringify([entry("one"), { ...entry("one"), label: "Imposter" }, entry("two")])
    );

    expect(await listPulpBackends()).toEqual([entry("one"), entry("two")]);
    expect(logged()).toEqual([
      expect.objectContaining({
        level: "warn",
        event: "pulp_backends_entry_duplicate",
        file,
        index: 1,
        id: "one",
      }),
    ]);
  });

  it("normalizes a hand-edited base URL", async () => {
    await writeFile(file, JSON.stringify([{ ...entry("one"), baseUrl: "https://one.example.test/api//" }]));

    expect((await listPulpBackends())[0].baseUrl).toBe("https://one.example.test/api");
  });

  it("resolves a relative PULP_BACKENDS_FILE against the working directory", async () => {
    await writeFile(file, JSON.stringify([entry("one")]));
    vi.stubEnv("PULP_BACKENDS_FILE", relative(process.cwd(), file));

    expect(await listPulpBackends()).toEqual([entry("one")]);
  });

  it("reads PULP_BACKENDS_FILE on every call", async () => {
    const other = join(directory, "other.json");
    await writeFile(file, JSON.stringify([entry("one")]));
    await writeFile(other, JSON.stringify([entry("two")]));

    expect((await listPulpBackends())[0].id).toBe("one");
    vi.stubEnv("PULP_BACKENDS_FILE", other);
    expect((await listPulpBackends())[0].id).toBe("two");
  });
});

describe("getPulpBackend", () => {
  it("returns null for an unknown id", async () => {
    await writeFile(file, JSON.stringify([entry("one")]));

    expect(await getPulpBackend("two")).toBeNull();
  });
});

describe("addPulpBackend", () => {
  it("writes the synthesized default entry and the new one when the file was absent", async () => {
    vi.stubEnv("PULP_BASE_URL", "https://env.example.test/pulp/api/v3/");
    vi.stubEnv("PULP_PROJECT_NAME", "Production");

    const added = await addPulpBackend({
      label: "  Staging ",
      baseUrl: " http://staging.example.test:8080/pulp/api/v3/ ",
    });

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.backend).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      label: "Staging",
      baseUrl: "http://staging.example.test:8080/pulp/api/v3",
      createdAt: expect.any(String),
    });
    expect(await stored()).toEqual([
      {
        id: DEFAULT_PULP_BACKEND_ID,
        label: "Production",
        baseUrl: "https://env.example.test/pulp/api/v3",
        createdAt: expect.any(String),
      },
      added.backend,
    ]);
    expect(await getPulpBackend(DEFAULT_PULP_BACKEND_ID)).toMatchObject({ label: "Production" });
    expect(await getPulpBackend(added.backend.id)).toEqual(added.backend);
  });

  it("writes pretty JSON with a trailing newline, creating the directory", async () => {
    file = join(directory, "nested", "deeper", "pulp-backends.json");
    vi.stubEnv("PULP_BACKENDS_FILE", file);

    const added = await addPulpBackend({ label: "One", baseUrl: "https://one.example.test" });

    if (!added.ok) throw new Error(added.detail);
    expect(await readFile(file, "utf8")).toBe(`${JSON.stringify([added.backend], null, 2)}\n`);
  });

  it("appends to a list that already has entries without adding the env server", async () => {
    vi.stubEnv("PULP_BASE_URL", "https://env.example.test/pulp/api/v3");
    await writeFile(file, JSON.stringify([entry("one")]));

    await addPulpBackend({ label: "Two", baseUrl: "https://two.example.test" });

    expect((await listPulpBackends()).map((backend) => backend.label)).toEqual(["Server one", "Two"]);
  });

  it("accepts a label of exactly 100 characters", async () => {
    const added = await addPulpBackend({ label: "a".repeat(100), baseUrl: "https://one.example.test" });

    expect(added.ok).toBe(true);
  });

  it.each([
    ["a non-http protocol", { label: "One", baseUrl: "ftp://one.example.test/" }, "http:// or https://"],
    ["a script URL", { label: "One", baseUrl: "javascript:alert(1)" }, "http:// or https://"],
    ["userinfo", { label: "One", baseUrl: "https://admin:secret@one.example.test/" }, "username or password"],
    ["a query string", { label: "One", baseUrl: "https://one.example.test/?a=1" }, "query string"],
    ["a fragment", { label: "One", baseUrl: "https://one.example.test/#top" }, "fragment"],
    ["text that is not a URL", { label: "One", baseUrl: "one.example.test" }, "not a valid URL"],
    ["a missing base URL", { label: "One" }, "Base URL"],
    ["a non-string base URL", { label: "One", baseUrl: 8080 }, "Base URL"],
    ["an empty label", { label: "", baseUrl: "https://one.example.test" }, "Label"],
    ["a blank label", { label: "   ", baseUrl: "https://one.example.test" }, "Label"],
    ["a missing label", { baseUrl: "https://one.example.test" }, "Label"],
    ["a non-string label", { label: 1, baseUrl: "https://one.example.test" }, "Label"],
    ["a label over 100 characters", { label: "a".repeat(101), baseUrl: "https://one.example.test" }, "100"],
  ])("rejects %s with a 400 and writes nothing", async (_name, input, detail) => {
    vi.stubEnv("PULP_BASE_URL", "https://env.example.test/pulp/api/v3");

    const added = await addPulpBackend(input);

    expect(added).toEqual({ ok: false, status: 400, detail: expect.stringContaining(detail) });
    await expect(readFile(file, "utf8")).rejects.toThrow("ENOENT");
  });

  it("persists five concurrent adds and leaves no temp files behind", async () => {
    vi.stubEnv("PULP_BASE_URL", "https://env.example.test/pulp/api/v3");

    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        addPulpBackend({ label: `Server ${n}`, baseUrl: `https://s${n}.example.test` })
      )
    );

    expect(results.every((result) => result.ok)).toBe(true);
    const labels = (await listPulpBackends()).map((backend) => backend.label);
    expect(labels).toHaveLength(6);
    expect(new Set(labels)).toEqual(
      new Set(["Pulp", "Server 1", "Server 2", "Server 3", "Server 4", "Server 5"])
    );
    expect(await readdir(directory)).toEqual(["pulp-backends.json"]);
  });

  it("keeps serving later writes after one write fails", async () => {
    // A regular file where the directory should be makes the first write fail.
    const blocker = join(directory, "blocker");
    await writeFile(blocker, "");
    vi.stubEnv("PULP_BACKENDS_FILE", join(blocker, "pulp-backends.json"));
    const failing = addPulpBackend({ label: "One", baseUrl: "https://one.example.test" });
    vi.stubEnv("PULP_BACKENDS_FILE", file);
    const following = addPulpBackend({ label: "Two", baseUrl: "https://two.example.test" });

    await expect(failing).rejects.toThrow();
    expect((await following).ok).toBe(true);
    expect((await listPulpBackends()).map((backend) => backend.label)).toEqual(["Two"]);
  });
});

describe("updatePulpBackend", () => {
  beforeEach(async () => {
    await writeFile(file, JSON.stringify([entry("one"), entry("two")]));
  });

  it("changes the label and keeps the id, base URL and creation time", async () => {
    const updated = await updatePulpBackend("one", { label: " Renamed " });

    expect(updated).toEqual({ ok: true, backend: { ...entry("one"), label: "Renamed" } });
    expect(await stored()).toEqual([{ ...entry("one"), label: "Renamed" }, entry("two")]);
  });

  it("changes the base URL, normalized, and keeps the rest", async () => {
    const updated = await updatePulpBackend("two", { baseUrl: "http://moved.example.test:8080/api/" });

    expect(updated).toEqual({
      ok: true,
      backend: { ...entry("two"), baseUrl: "http://moved.example.test:8080/api" },
    });
    expect(await stored()).toEqual([
      entry("one"),
      { ...entry("two"), baseUrl: "http://moved.example.test:8080/api" },
    ]);
  });

  it("changes both fields at once", async () => {
    const updated = await updatePulpBackend("one", {
      label: "Both",
      baseUrl: "https://both.example.test",
    });

    expect(updated).toEqual({
      ok: true,
      backend: { ...entry("one"), label: "Both", baseUrl: "https://both.example.test" },
    });
  });

  it("answers 404 for an unknown id and leaves the file alone", async () => {
    const before = await readFile(file, "utf8");

    expect(await updatePulpBackend("missing", { label: "Nope" })).toEqual({
      ok: false,
      status: 404,
      detail: "Pulp server not found.",
    });
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("answers 400 for an invalid base URL and leaves the file alone", async () => {
    const before = await readFile(file, "utf8");

    expect(await updatePulpBackend("one", { label: "Fine", baseUrl: "file:///etc/passwd" })).toEqual({
      ok: false,
      status: 400,
      detail: "Base URL must start with http:// or https://.",
    });
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("answers 400 for an invalid label and for an update with no fields", async () => {
    expect(await updatePulpBackend("one", { label: "a".repeat(101) })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await updatePulpBackend("one", {})).toMatchObject({ ok: false, status: 400 });
  });

  it("updates the synthesized default entry by writing it into the file", async () => {
    await rm(file);
    vi.stubEnv("PULP_BASE_URL", "https://env.example.test/pulp/api/v3");

    const updated = await updatePulpBackend(DEFAULT_PULP_BACKEND_ID, { label: "Renamed" });

    expect(updated.ok).toBe(true);
    expect(await stored()).toEqual([
      {
        id: DEFAULT_PULP_BACKEND_ID,
        label: "Renamed",
        baseUrl: "https://env.example.test/pulp/api/v3",
        createdAt: expect.any(String),
      },
    ]);
  });
});

describe("removePulpBackend", () => {
  beforeEach(async () => {
    await writeFile(file, JSON.stringify([entry("one"), entry("two")]));
  });

  it("removes an existing backend", async () => {
    expect(await removePulpBackend("one")).toBe(true);

    expect(await getPulpBackend("one")).toBeNull();
    expect(await stored()).toEqual([entry("two")]);
  });

  it("returns false for an unknown id and leaves the file alone", async () => {
    const before = await readFile(file, "utf8");

    expect(await removePulpBackend("missing")).toBe(false);
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("writes an empty list when the last entry goes, which reads back as the fallback", async () => {
    vi.stubEnv("PULP_BASE_URL", "https://env.example.test/pulp/api/v3");

    expect(await removePulpBackend("one")).toBe(true);
    expect(await removePulpBackend("two")).toBe(true);

    expect(await stored()).toEqual([]);
    expect((await listPulpBackends()).map((backend) => backend.id)).toEqual([
      DEFAULT_PULP_BACKEND_ID,
    ]);
  });
});
