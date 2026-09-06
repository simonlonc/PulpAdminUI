import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { waitForTask } from "@/app/api/pulp/repositories/_server";
import type { PulpAuth } from "@/lib/pulp";

const auth: PulpAuth = { username: "admin", password: "admin" };

// waitForTask polls every 5s, so real timers would make this suite take minutes; fake timers
// plus advanceTimersByTimeAsync let a "running" -> "completed" poll resolve immediately.
describe("waitForTask", () => {
  beforeEach(() => {
    vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("polls until the task completes, then returns it", async () => {
    vi.useFakeTimers();
    const responses = [
      new Response(JSON.stringify({ state: "running" }), { status: 200 }),
      new Response(JSON.stringify({ state: "completed", pulp_href: "/tasks/1/" }), { status: 200 }),
    ];
    const fetchMock = vi.fn(async () => responses.shift()!);
    vi.stubGlobal("fetch", fetchMock);

    const promise = waitForTask("/pulp/api/v3/tasks/1/", auth);
    await vi.advanceTimersByTimeAsync(5000);
    const task = await promise;

    expect(task.state).toBe("completed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws with the task's error when the task fails", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ state: "failed", error: "boom" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(waitForTask("/pulp/api/v3/tasks/1/", auth)).rejects.toThrow("boom");
  });

  it("throws with a stringified fallback error when a canceled task has no error", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ state: "canceled" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(waitForTask("/pulp/api/v3/tasks/1/", auth)).rejects.toThrow(
      JSON.stringify("Task failed")
    );
  });

  it("throws the response detail when the task endpoint answers with a non-ok status", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ detail: "Internal error." }), { status: 500 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(waitForTask("/pulp/api/v3/tasks/1/", auth)).rejects.toThrow("Internal error.");
  });
});
