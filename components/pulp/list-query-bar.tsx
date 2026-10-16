"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";
import { SlidersHorizontal } from "lucide-react";
import { PULP_PAGE_SIZES, type PulpListQuery } from "@/lib/pulp-list-query";

const Q_HELP_TEXT =
  'Combine the endpoint\'s own filters with NOT, AND, OR. Examples: "state=completed AND name__contains=sync", "NOT state=completed". Field names are the same filters this endpoint accepts elsewhere.';

const LABEL_SELECT_HELP_TEXT =
  'Filter by label. "key" matches any object with that key, "key=value" an exact value, "key!=value" any other value, "!key" objects without the key, and "key~text" a substring match.';

/**
 * Search input plus a page-size select for a Pulp list page, driven by
 * usePulpListQuery. The search box holds its own draft text and only calls
 * onFiltersChange on submit or when cleared, so typing does not fire a
 * server request (and a URL write) on every keystroke.
 *
 * Passing showQ adds a collapsed-by-default "advanced filter" row for
 * Pulp's `q` complex filter (NOT/AND/OR over the endpoint's own filters).
 * Leave showQ false for endpoints that do not advertise `q`.
 */
export type ListQueryBarProps = {
  search: string;
  pageSize: number;
  onPageSizeChange: (pageSize: number) => void;
  onFiltersChange: (filters: Partial<PulpListQuery>) => void;
  disabled?: boolean;
  searchPlaceholder?: string;
  /** Set to false for endpoints with no search param (e.g. the generic /content/ list). */
  showSearch?: boolean;
  /** Current `q` complex-filter value. Ignored (and the row hidden) unless showQ is set. */
  q?: string;
  /** Set to true for endpoints that advertise Pulp's `q` complex filter. */
  showQ?: boolean;
  /** Current `pulp_label_select` value. Ignored (and the control hidden) unless showLabelSelect is set. */
  labelSelect?: string;
  /** Set to true for endpoints that advertise `pulp_label_select`. */
  showLabelSelect?: boolean;
};

export function ListQueryBar({
  search,
  pageSize,
  onPageSizeChange,
  onFiltersChange,
  disabled,
  searchPlaceholder = "Search by name",
  showSearch = true,
  q = "",
  showQ = false,
  labelSelect = "",
  showLabelSelect = false,
}: ListQueryBarProps) {
  const [draft, setDraft] = useState(search);
  const [qDraft, setQDraft] = useState(q);
  const [advancedOpen, setAdvancedOpen] = useState(q.length > 0);
  const [labelSelectDraft, setLabelSelectDraft] = useState(labelSelect);
  // Below sm only the search row shows until the user asks for the rest.
  const [filtersOpen, setFiltersOpen] = useState(q.length > 0 || labelSelect.length > 0);
  const activeFilterCount = (q ? 1 : 0) + (labelSelect ? 1 : 0);

  useEffect(() => {
    setDraft(search);
  }, [search]);

  useEffect(() => {
    setQDraft(q);
  }, [q]);

  useEffect(() => {
    setLabelSelectDraft(labelSelect);
  }, [labelSelect]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: Partial<PulpListQuery> = {};
    if (showSearch) {
      patch.search = draft.trim();
    }
    if (showQ) {
      patch.q = qDraft.trim();
    }
    if (showLabelSelect) {
      patch.labelSelect = labelSelectDraft.trim();
    }
    onFiltersChange(patch);
  }

  function handleClear() {
    setDraft("");
    onFiltersChange({ search: "" });
  }

  function handleClearQ() {
    setQDraft("");
    onFiltersChange({ q: "" });
  }

  function handleClearLabelSelect() {
    setLabelSelectDraft("");
    onFiltersChange({ labelSelect: "" });
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-end gap-3">
        {showSearch ? (
          <FormField label="Search" className="max-sm:w-full">
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={searchPlaceholder}
                disabled={disabled}
                className="w-56 max-sm:min-w-0 max-sm:flex-1"
              />
              <Button type="submit" variant="outline" disabled={disabled}>
                Search
              </Button>
              {draft ? (
                <Button type="button" variant="outline" disabled={disabled} onClick={handleClear}>
                  Clear
                </Button>
              ) : null}
              <FiltersToggle
                open={filtersOpen}
                activeCount={activeFilterCount}
                onToggle={() => setFiltersOpen((open) => !open)}
              />
            </div>
          </FormField>
        ) : (
          <FiltersToggle
            open={filtersOpen}
            activeCount={activeFilterCount}
            onToggle={() => setFiltersOpen((open) => !open)}
          />
        )}
        <div className={cn("contents", !filtersOpen && "max-sm:hidden")}>
          <FormField label="Page size">
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              disabled={disabled}
              className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            >
              {PULP_PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </FormField>
          {showLabelSelect ? (
            <FormField
              label={
                <span className="inline-flex items-center gap-1.5">
                  Label
                  <InfoTooltip text={LABEL_SELECT_HELP_TEXT} />
                </span>
              }
            >
              <div className="flex gap-2">
                <Input
                  value={labelSelectDraft}
                  onChange={(event) => setLabelSelectDraft(event.target.value)}
                  placeholder="env=prod"
                  disabled={disabled}
                  className="w-48"
                />
                {labelSelectDraft ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={handleClearLabelSelect}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
            </FormField>
          ) : null}
          {showQ ? (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              {advancedOpen ? "Hide advanced filter" : "Advanced filter"}
            </Button>
          ) : null}
        </div>
      </div>
      {showQ && advancedOpen ? (
        <FormField
          className={cn(!filtersOpen && "max-sm:hidden")}
          label={
            <span className="inline-flex items-center gap-1.5">
              Advanced filter (q)
              <InfoTooltip text={Q_HELP_TEXT} />
            </span>
          }
        >
          <div className="flex gap-2">
            <Input
              value={qDraft}
              onChange={(event) => setQDraft(event.target.value)}
              placeholder="state=completed AND name__contains=sync"
              disabled={disabled}
              className="w-96 font-mono text-xs max-sm:min-w-0 max-sm:flex-1"
            />
            <Button type="submit" variant="outline" disabled={disabled}>
              Apply
            </Button>
            {qDraft ? (
              <Button type="button" variant="outline" disabled={disabled} onClick={handleClearQ}>
                Clear
              </Button>
            ) : null}
          </div>
        </FormField>
      ) : null}
    </form>
  );
}

function FiltersToggle({
  open,
  activeCount,
  onToggle,
}: {
  open: boolean;
  activeCount: number;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      aria-expanded={open}
      aria-label="Filters"
      onClick={onToggle}
      className="inline-flex items-center gap-1.5 px-3 sm:hidden"
    >
      <SlidersHorizontal aria-hidden className="size-4" />
      {activeCount > 0 ? <span className="text-xs tabular-nums">{activeCount}</span> : null}
    </Button>
  );
}

export type SortableColumnHeaderProps = {
  label: string;
  field: string;
  ordering: string;
  onSort: (ordering: string) => void;
};

/** Clickable table-header label that toggles ordering ("field" / "-field") on click. */
export function SortableColumnHeader({ label, field, ordering, onSort }: SortableColumnHeaderProps) {
  const isDescending = ordering === `-${field}`;
  const isActive = isDescending || ordering === field;

  function handleClick() {
    onSort(isActive && !isDescending ? `-${field}` : field);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-200"
    >
      {label}
      {isActive ? <span aria-hidden>{isDescending ? "▼" : "▲"}</span> : null}
    </button>
  );
}

type SortBarProps = {
  fields: { label: string; field: string }[];
  ordering: string;
  onSort: (ordering: string) => void;
};

/** Phone-width stand-in for sortable column headers, which are hidden once a table stacks. */
export function SortBar({ fields, ordering, onSort }: SortBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 sm:hidden pointer-coarse:[&_button]:py-2">
      <span>Sort by</span>
      {fields.map(({ label, field }) => (
        <SortableColumnHeader
          key={field}
          label={label}
          field={field}
          ordering={ordering}
          onSort={onSort}
        />
      ))}
    </div>
  );
}
