"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { PULP_PAGE_SIZES } from "@/lib/pulp-list-query";

const Q_HELP_TEXT =
  'Combine the endpoint\'s own filters with NOT, AND, OR. Examples: "state=completed AND name__contains=sync", "NOT state=completed". Field names are the same filters this endpoint accepts elsewhere.';

const LABEL_SELECT_HELP_TEXT =
  'Filter by label. "key" matches any object with that key, "key=value" an exact value, "key!=value" any other value, "!key" objects without the key, and "key~text" a substring match.';

/**
 * Search input plus a page-size select for a Pulp list page, driven by
 * usePulpListQuery. The search box holds its own draft text and only calls
 * onSearchChange on submit or when cleared, so typing does not fire a
 * server request (and a URL write) on every keystroke.
 *
 * Passing q/onQChange adds a collapsed-by-default "advanced filter" row for
 * Pulp's `q` complex filter (NOT/AND/OR over the endpoint's own filters).
 * Omit onQChange for endpoints that do not advertise `q`.
 */
export type ListQueryBarProps = {
  search: string;
  onSearchChange: (search: string) => void;
  pageSize: number;
  onPageSizeChange: (pageSize: number) => void;
  disabled?: boolean;
  searchPlaceholder?: string;
  /** Set to false for endpoints with no search param (e.g. the generic /content/ list). */
  showSearch?: boolean;
  /** Current `q` complex-filter value. Ignored (and the row hidden) unless onQChange is set. */
  q?: string;
  onQChange?: (q: string) => void;
  /** Current `pulp_label_select` value. Ignored (and the control hidden) unless onLabelSelectChange is set. */
  labelSelect?: string;
  onLabelSelectChange?: (labelSelect: string) => void;
};

export function ListQueryBar({
  search,
  onSearchChange,
  pageSize,
  onPageSizeChange,
  disabled,
  searchPlaceholder = "Search by name",
  showSearch = true,
  q = "",
  onQChange,
  labelSelect = "",
  onLabelSelectChange,
}: ListQueryBarProps) {
  const [draft, setDraft] = useState(search);
  const [qDraft, setQDraft] = useState(q);
  const [advancedOpen, setAdvancedOpen] = useState(q.length > 0);
  const [labelSelectDraft, setLabelSelectDraft] = useState(labelSelect);

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
    onSearchChange(draft.trim());
    onQChange?.(qDraft.trim());
    onLabelSelectChange?.(labelSelectDraft.trim());
  }

  function handleClear() {
    setDraft("");
    onSearchChange("");
  }

  function handleClearQ() {
    setQDraft("");
    onQChange?.("");
  }

  function handleClearLabelSelect() {
    setLabelSelectDraft("");
    onLabelSelectChange?.("");
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-end gap-3">
        {showSearch ? (
          <FormField label="Search">
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={searchPlaceholder}
                disabled={disabled}
                className="w-56"
              />
              <Button type="submit" variant="outline" disabled={disabled}>
                Search
              </Button>
              {draft ? (
                <Button type="button" variant="outline" disabled={disabled} onClick={handleClear}>
                  Clear
                </Button>
              ) : null}
            </div>
          </FormField>
        ) : null}
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
        {onLabelSelectChange ? (
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
        {onQChange ? (
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
      {onQChange && advancedOpen ? (
        <FormField
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
              className="w-96 font-mono text-xs"
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
