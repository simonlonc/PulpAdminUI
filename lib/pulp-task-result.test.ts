import { describe, expect, it } from "vitest";

import {
  hrefFromCreatedResource,
  isPulpTaskFinished,
  pulpTaskFailureMessage,
  resolvePublicationHrefAfterTask,
} from "@/lib/pulp-task-result";

describe("hrefFromCreatedResource", () => {
  it("returns a string entry as-is", () => {
    expect(hrefFromCreatedResource("/pulp/api/v3/publications/rpm/rpm/abc/")).toBe(
      "/pulp/api/v3/publications/rpm/rpm/abc/"
    );
  });

  it("reads pulp_href, falling back to href", () => {
    expect(hrefFromCreatedResource({ pulp_href: "/x/" })).toBe("/x/");
    expect(hrefFromCreatedResource({ href: "/y/" })).toBe("/y/");
  });

  it("returns null when neither key is a string", () => {
    expect(hrefFromCreatedResource({})).toBeNull();
    expect(hrefFromCreatedResource(undefined)).toBeNull();
  });
});

describe("resolvePublicationHrefAfterTask", () => {
  it("finds the publication href among several created resources", () => {
    const task = {
      created_resources: ["/pulp/api/v3/repositories/rpm/rpm/abc/", "/pulp/api/v3/publications/rpm/rpm/def/"],
    };
    expect(resolvePublicationHrefAfterTask(task, null)).toBe("/pulp/api/v3/publications/rpm/rpm/def/");
  });

  it("falls back to the first created resource when none look like a publication", () => {
    const task = {
      created_resources: [{ pulp_href: "/pulp/api/v3/repositories/rpm/rpm/abc/versions/1/" }],
    };
    expect(resolvePublicationHrefAfterTask(task, null)).toBe(
      "/pulp/api/v3/repositories/rpm/rpm/abc/versions/1/"
    );
  });

  it("falls back to task.pulp_href or task.href when they look like a publication", () => {
    expect(
      resolvePublicationHrefAfterTask({ pulp_href: "/pulp/api/v3/publications/rpm/rpm/abc/" }, null)
    ).toBe("/pulp/api/v3/publications/rpm/rpm/abc/");
    expect(
      resolvePublicationHrefAfterTask({ href: "/pulp/api/v3/publications/rpm/rpm/abc/" }, null)
    ).toBe("/pulp/api/v3/publications/rpm/rpm/abc/");
  });

  it("falls back to the given fallback when nothing else matches", () => {
    expect(resolvePublicationHrefAfterTask({}, "/fallback/")).toBe("/fallback/");
    expect(resolvePublicationHrefAfterTask({ created_resources: [] }, "/fallback/")).toBe("/fallback/");
    expect(
      resolvePublicationHrefAfterTask({ pulp_href: "/pulp/api/v3/repositories/rpm/rpm/abc/" }, "/fallback/")
    ).toBe("/fallback/");
  });
});

describe("isPulpTaskFinished", () => {
  it("is true for every terminal state", () => {
    expect(isPulpTaskFinished("completed")).toBe(true);
    expect(isPulpTaskFinished("failed")).toBe(true);
    expect(isPulpTaskFinished("canceled")).toBe(true);
    expect(isPulpTaskFinished("skipped")).toBe(true);
  });

  it("is false for non-terminal states, including canceling", () => {
    expect(isPulpTaskFinished("running")).toBe(false);
    expect(isPulpTaskFinished("waiting")).toBe(false);
    expect(isPulpTaskFinished("canceling")).toBe(false);
  });

  it("is false for undefined", () => {
    expect(isPulpTaskFinished(undefined)).toBe(false);
  });
});

describe("pulpTaskFailureMessage", () => {
  it("returns a string error as-is", () => {
    expect(pulpTaskFailureMessage({ state: "failed", error: "boom" })).toBe("boom");
  });

  it("JSON-stringifies an object error", () => {
    expect(pulpTaskFailureMessage({ state: "canceled", error: { description: "boom" } })).toBe(
      JSON.stringify({ description: "boom" })
    );
  });

  it("falls back to a default message when the error is missing", () => {
    expect(pulpTaskFailureMessage({ state: "failed" })).toBe(JSON.stringify("Task failed"));
  });

  it("returns null when the task did not fail", () => {
    expect(pulpTaskFailureMessage({ state: "completed", error: "boom" })).toBeNull();
  });
});
