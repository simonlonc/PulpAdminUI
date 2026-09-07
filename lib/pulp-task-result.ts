/**
 * Pure helpers for reading Pulp task results, shared by server routes and the
 * browser. No `fetch`, no `next/*`, no env vars here: `_server.ts` re-exports
 * `hrefFromCreatedResource` and `resolvePublicationHrefAfterTask` for its
 * existing importers, and `services/pulp/task-service.ts` uses
 * `isPulpTaskFinished`/`pulpTaskFailureMessage` to poll a task from the
 * browser instead of blocking a server request on it.
 */

export type CreatedResourceEntry = string | { pulp_href?: string; href?: string };

export function hrefFromCreatedResource(entry: CreatedResourceEntry | undefined): string | null {
  if (entry == null) return null;
  if (typeof entry === "string") return entry;
  const h = entry.pulp_href ?? entry.href;
  return typeof h === "string" ? h : null;
}

/** Pulp may return created_resources as strings or nested objects; publication may not be index 0. */
export function resolvePublicationHrefAfterTask(
  task: {
    created_resources?: CreatedResourceEntry[];
    pulp_href?: string;
    href?: string;
  },
  fallback: string | null
): string | null {
  const resources = task.created_resources;
  if (resources?.length) {
    for (const r of resources) {
      const h = hrefFromCreatedResource(r);
      if (h && h.includes("/publications/")) {
        return h;
      }
    }
    const first = hrefFromCreatedResource(resources[0]);
    if (first) {
      return first;
    }
  }
  if (typeof task.pulp_href === "string" && task.pulp_href.includes("/publications/")) {
    return task.pulp_href;
  }
  if (typeof task.href === "string" && task.href.includes("/publications/")) {
    return task.href;
  }
  return fallback;
}

/** Pulp task states that will not change further; `canceling` is not among them, it still settles into `canceled`. */
const TERMINAL_TASK_STATES = ["completed", "failed", "canceled", "skipped"];

export function isPulpTaskFinished(state: string | undefined): boolean {
  return state !== undefined && TERMINAL_TASK_STATES.includes(state);
}

/** Null when the task did not fail; otherwise the same serialization waitForTask used to throw. */
export function pulpTaskFailureMessage(task: { state?: string; error?: unknown }): string | null {
  if (task.state !== "failed" && task.state !== "canceled") {
    return null;
  }
  return typeof task.error === "string" ? task.error : JSON.stringify(task.error ?? "Task failed");
}
