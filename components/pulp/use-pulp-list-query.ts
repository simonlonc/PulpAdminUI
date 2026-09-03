"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_PULP_LIST_QUERY,
  PulpListQuery,
  buildPulpListParams,
  parsePulpListQuery,
  pulpListQueryToUrlParams,
} from "@/lib/pulp-list-query";

const LIST_QUERY_KEYS = ["search", "ordering", "page", "size", "label", "q"] as const;

/**
 * Query state (search, ordering, page, page size, label selector, q filter) for
 * a Pulp list page, mirrored into the browser URL the same way app/roles/list/page.tsx
 * mirrors its "page" param: read with useSearchParams, written back with
 * router.replace so the URL stays the single source of truth.
 *
 * Reads the URL via useSearchParams, so a page calling this hook must render
 * it inside a <Suspense> boundary, the way app/roles/list/page.tsx wraps
 * RolesListPageContent -- useSearchParams opts the tree into client-side
 * rendering and the production build fails at prerender otherwise.
 *
 * This hook only tracks query state; it does not fetch data.
 */
export function usePulpListQuery(options?: { pageSize?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaultPageSize = options?.pageSize;

  const query = useMemo<PulpListQuery>(() => {
    const parsed = parsePulpListQuery(searchParams);
    if (defaultPageSize && !searchParams.get("size")) {
      return { ...parsed, pageSize: defaultPageSize };
    }
    return parsed;
  }, [searchParams, defaultPageSize]);

  const params = useMemo(() => buildPulpListParams(query), [query]);

  const pushQuery = useCallback(
    (next: PulpListQuery) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      for (const key of LIST_QUERY_KEYS) {
        nextParams.delete(key);
      }
      for (const [key, value] of pulpListQueryToUrlParams(next)) {
        nextParams.set(key, value);
      }
      const qs = nextParams.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const setSearch = useCallback(
    (search: string) => pushQuery({ ...query, search, page: DEFAULT_PULP_LIST_QUERY.page }),
    [pushQuery, query]
  );
  const setOrdering = useCallback(
    (ordering: string) => pushQuery({ ...query, ordering, page: DEFAULT_PULP_LIST_QUERY.page }),
    [pushQuery, query]
  );
  const setPage = useCallback(
    (page: number) => pushQuery({ ...query, page }),
    [pushQuery, query]
  );
  const setPageSize = useCallback(
    (pageSize: number) => pushQuery({ ...query, pageSize, page: DEFAULT_PULP_LIST_QUERY.page }),
    [pushQuery, query]
  );
  const setLabelSelect = useCallback(
    (labelSelect: string) =>
      pushQuery({ ...query, labelSelect, page: DEFAULT_PULP_LIST_QUERY.page }),
    [pushQuery, query]
  );
  const setQ = useCallback(
    (q: string) => pushQuery({ ...query, q, page: DEFAULT_PULP_LIST_QUERY.page }),
    [pushQuery, query]
  );

  return { query, params, setSearch, setOrdering, setPage, setPageSize, setLabelSelect, setQ };
}
