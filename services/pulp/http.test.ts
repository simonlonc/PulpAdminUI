import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pulpAuthService } from "./auth-service";
import { readApiDetail, SESSION_LOST_EVENT } from "./http";

describe("readApiDetail session-lost event", () => {
  const dispatchEvent = vi.fn();

  beforeEach(() => {
    dispatchEvent.mockClear();
    vi.stubGlobal("window", { dispatchEvent });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function failure(status: number): Response {
    return new Response(JSON.stringify({ detail: "nope" }), { status });
  }

  it("dispatches the event once on a 401", async () => {
    await expect(readApiDetail(failure(401))).resolves.toBe("nope");

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(SESSION_LOST_EVENT);
  });

  it("does not dispatch on a 400 or 403", async () => {
    await readApiDetail(failure(400));
    await readApiDetail(failure(403));

    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("does not dispatch on a 401 when signalSessionLost is false", async () => {
    await readApiDetail(failure(401), { signalSessionLost: false });

    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it("does not throw when window is unavailable", async () => {
    vi.unstubAllGlobals();

    await expect(readApiDetail(failure(401))).resolves.toBe("nope");
  });

  it("does not dispatch when the login POST answers 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failure(401)));

    await expect(pulpAuthService.login("admin", "wrong")).resolves.toEqual({
      ok: false,
      detail: "nope",
    });
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
