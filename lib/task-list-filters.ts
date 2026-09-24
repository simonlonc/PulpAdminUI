/**
 * Task-list-only filters for GET /tasks/ (state, started-after, started-before).
 *
 * These sit alongside PulpListQuery (see lib/pulp-list-query.ts) but are not
 * shared with any other list page, so they get their own type instead of
 * growing PulpListQuery. This module gives app/tasks/list/page.tsx the same
 * pure read/write-URL/build-request-params shape the shared query already
 * has, so the filters survive a reload and a shared link the same way
 * search/ordering/page/size/label/q do.
 */

export type PulpTaskFilters = {
  state: string;
  startedAfter: string;
  startedBefore: string;
};

export const DEFAULT_PULP_TASK_FILTERS: PulpTaskFilters = {
  state: "",
  startedAfter: "",
  startedBefore: "",
};

/** "YYYY-MM-DD" from a date input to the ISO-8601 timestamp Pulp's date-range filters accept. */
function dateInputToIsoStart(value: string): string {
  return `${value}T00:00:00.000Z`;
}

function dateInputToIsoEnd(value: string): string {
  return `${value}T23:59:59.999Z`;
}

const DATE_INPUT_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether `value` is a real calendar date in "YYYY-MM-DD" shape. Date itself is the authority,
 * not a hand-rolled calendar: Date.parse must accept the ISO timestamp built from it, and
 * round-tripping through Date must reproduce that same timestamp (Date.parse silently rolls an
 * out-of-range day like "2024-02-30" over into the next month instead of rejecting it).
 */
function isValidDateInput(value: string): boolean {
  if (!DATE_INPUT_SHAPE.test(value)) return false;
  const iso = dateInputToIsoStart(value);
  return !Number.isNaN(Date.parse(iso)) && new Date(iso).toISOString() === iso;
}

/** Applies the task filters to a Pulp GET /tasks/ request's query params, in place. */
export function applyPulpTaskFilters(params: URLSearchParams, filters: PulpTaskFilters): void {
  if (filters.state) {
    params.set("state", filters.state);
  }
  if (filters.startedAfter && isValidDateInput(filters.startedAfter)) {
    params.set("started_at__gte", dateInputToIsoStart(filters.startedAfter));
  }
  if (filters.startedBefore && isValidDateInput(filters.startedBefore)) {
    params.set("started_at__lte", dateInputToIsoEnd(filters.startedBefore));
  }
}

/** Reads a PulpTaskFilters out of the browser URL's query params, falling back to defaults. */
export function parsePulpTaskFilters(params: URLSearchParams): PulpTaskFilters {
  const state = params.get("state") ?? DEFAULT_PULP_TASK_FILTERS.state;
  const startedAfter = params.get("started_after") ?? DEFAULT_PULP_TASK_FILTERS.startedAfter;
  const startedBefore = params.get("started_before") ?? DEFAULT_PULP_TASK_FILTERS.startedBefore;

  return { state, startedAfter, startedBefore };
}

/**
 * Inverse of parsePulpTaskFilters: the browser-URL params for a set of task
 * filters, in the record shape usePulpListQuery's setExtraParams takes. Every
 * key is always present; a filter left at its default is the empty string,
 * which deletes the param instead of writing "state=" into the URL, so a
 * pristine task list page keeps a clean URL.
 */
export function pulpTaskFiltersToUrlParams(filters: PulpTaskFilters): Record<string, string> {
  return {
    state: filters.state,
    started_after: filters.startedAfter,
    started_before: filters.startedBefore,
  };
}
