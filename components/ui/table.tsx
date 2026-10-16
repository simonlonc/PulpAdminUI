import {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { cn } from "./cn";

export function TableWrapper({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("w-full overflow-x-auto", className)} {...props} />;
}

type TableProps = TableHTMLAttributes<HTMLTableElement> & {
  /** Set to false for narrow tables (e.g. field/value pairs) that already fit a phone. */
  stacked?: boolean;
};

/**
 * Below `sm` a table stacks: each body row becomes a bordered card and each cell a
 * "label: value" line. Give cells a `label` (usually the column header) and mark the
 * row's name cell `stack="heading"` and its RowActionMenu cell `stack="actions"`.
 */
export function Table({ className, stacked = true, ...props }: TableProps) {
  return (
    <table
      data-stacked={stacked ? "" : undefined}
      className={cn("w-full text-sm stacked:block", className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn("bg-zinc-50 stacked:hidden dark:bg-zinc-900/50", className)} {...props} />
  );
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn(
        "stacked:flex stacked:flex-col stacked:gap-2",
        "[&_tr]:transition-[background-color,opacity] [&_tr]:duration-150",
        "[&_tr:hover:not([data-frozen])]:bg-zinc-100/90 dark:[&_tr:hover:not([data-frozen])]:bg-zinc-800/45",
        className
      )}
      {...props}
    />
  );
}

type TableRowProps = HTMLAttributes<HTMLTableRowElement> & {
  /** Row is busy (e.g. async action); dims the row and blocks interaction. */
  frozen?: boolean;
};

export function TableRow({ className, frozen, ...props }: TableRowProps) {
  return (
    <tr
      data-frozen={frozen ? "true" : undefined}
      aria-busy={frozen || undefined}
      className={cn(
        "border-b border-zinc-200 last:border-b-0 dark:border-zinc-800",
        "stacked:relative stacked:flex stacked:flex-col stacked:gap-1 stacked:rounded-lg stacked:border stacked:p-3 stacked:last:border-b",
        frozen &&
          "pointer-events-none bg-zinc-100/65 opacity-75 dark:bg-zinc-900/55 dark:opacity-80",
        className
      )}
      {...props}
    />
  );
}

export function TableHeaderCell({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500",
        className
      )}
      {...props}
    />
  );
}

type TableCellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  /** Shown before the value when the table stacks into cards below `sm`. */
  label?: string;
  /** Card role below `sm`: the card's title line, its top-right action menu, or left out. */
  stack?: "heading" | "actions" | "hide";
};

export function TableCell({ className, label, stack, ...props }: TableCellProps) {
  return (
    <td
      data-label={label}
      className={cn(
        "px-3 py-2 align-middle",
        "stacked:flex stacked:min-w-0 stacked:max-w-none stacked:gap-3 stacked:p-0 stacked:text-xs stacked:whitespace-normal stacked:[overflow-wrap:anywhere]",
        label &&
          "stacked:before:w-24 stacked:before:shrink-0 stacked:before:text-zinc-500 stacked:before:content-[attr(data-label)] dark:stacked:before:text-zinc-400",
        stack === "heading" && "stacked:order-first stacked:pr-12 stacked:text-sm stacked:font-medium",
        stack === "actions" && "stacked:absolute stacked:top-2 stacked:right-2",
        stack === "hide" && "stacked:hidden",
        className
      )}
      {...props}
    />
  );
}
