/**
 * Shared list-query primitive for Pulp list endpoints (repositories, remotes,
 * publications, roles, users, ...).
 *
 * List pages all need the same handful of query knobs: search text, ordering,
 * page size, page/offset, label selector, and a `q` complex filter. This
 * module gives them one shape (PulpListQuery) plus pure functions to
 * serialize it to Pulp's query params (limit, offset, ordering,
 * name__icontains, pulp_label_select, q) and to mirror it into the browser's
 * URL query string, so every list page reads and writes the URL the same way
 * instead of inventing its own param names.
 */

export type PulpListQuery = {
  search: string;
  ordering: string;
  page: number;
  pageSize: number;
  labelSelect: string;
  q: string;
};

export const DEFAULT_PULP_LIST_QUERY: PulpListQuery = {
  search: "",
  ordering: "",
  page: 1,
  pageSize: 100,
  labelSelect: "",
  q: "",
};

export const PULP_PAGE_SIZES = [25, 50, 100, 200] as const;

export type PulpPageSize = (typeof PULP_PAGE_SIZES)[number];

function isPulpPageSize(value: number): value is PulpPageSize {
  return (PULP_PAGE_SIZES as readonly number[]).includes(value);
}

/** Serializes a PulpListQuery to the query params Pulp's list endpoints accept. */
export function buildPulpListParams(
  query: PulpListQuery,
  options?: { searchField?: string; searchLookup?: string }
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("limit", String(query.pageSize));
  params.set("offset", String((query.page - 1) * query.pageSize));

  if (query.ordering) {
    params.set("ordering", query.ordering);
  }
  if (query.search) {
    const field = options?.searchField ?? "name";
    const lookup = options?.searchLookup ?? "icontains";
    params.set(`${field}__${lookup}`, query.search);
  }
  if (query.labelSelect) {
    params.set("pulp_label_select", query.labelSelect);
  }
  if (query.q) {
    params.set("q", query.q);
  }

  return params;
}

/** Reads a PulpListQuery out of the browser URL's query params, falling back to defaults. */
export function parsePulpListQuery(params: URLSearchParams): PulpListQuery {
  const search = params.get("search") ?? DEFAULT_PULP_LIST_QUERY.search;
  const ordering = params.get("ordering") ?? DEFAULT_PULP_LIST_QUERY.ordering;
  const labelSelect = params.get("label") ?? DEFAULT_PULP_LIST_QUERY.labelSelect;
  const q = params.get("q") ?? DEFAULT_PULP_LIST_QUERY.q;

  const rawPage = Number.parseInt(params.get("page") ?? "", 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : DEFAULT_PULP_LIST_QUERY.page;

  const rawSize = Number.parseInt(params.get("size") ?? "", 10);
  const pageSize = isPulpPageSize(rawSize) ? rawSize : DEFAULT_PULP_LIST_QUERY.pageSize;

  return { search, ordering, page, pageSize, labelSelect, q };
}

/**
 * Inverse of parsePulpListQuery: serializes a PulpListQuery to the browser
 * URL's query params, omitting values equal to the default so a pristine
 * list page keeps a clean URL.
 */
export function pulpListQueryToUrlParams(query: PulpListQuery): URLSearchParams {
  const params = new URLSearchParams();

  if (query.search !== DEFAULT_PULP_LIST_QUERY.search) {
    params.set("search", query.search);
  }
  if (query.ordering !== DEFAULT_PULP_LIST_QUERY.ordering) {
    params.set("ordering", query.ordering);
  }
  if (query.page !== DEFAULT_PULP_LIST_QUERY.page) {
    params.set("page", String(query.page));
  }
  if (query.pageSize !== DEFAULT_PULP_LIST_QUERY.pageSize) {
    params.set("size", String(query.pageSize));
  }
  if (query.labelSelect !== DEFAULT_PULP_LIST_QUERY.labelSelect) {
    params.set("label", query.labelSelect);
  }
  if (query.q !== DEFAULT_PULP_LIST_QUERY.q) {
    params.set("q", query.q);
  }

  return params;
}
