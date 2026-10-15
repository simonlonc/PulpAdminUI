import { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type RowCardProps = HTMLAttributes<HTMLLIElement> & {
  /** What the row is called; the first line of the card. */
  heading: ReactNode;
  /** The row's action control (e.g. RowActionMenu), pinned to the top right of the card. */
  actions?: ReactNode;
  /** Row is busy (e.g. async action); dims the card and blocks interaction. */
  frozen?: boolean;
};

/**
 * Phone-width stand-in for a table row: render a list of these in a `ul` shown below `sm`
 * and hide the table there. Put one RowCardField per table column in the children.
 */
export function RowCard({ heading, actions, frozen, className, children, ...props }: RowCardProps) {
  return (
    <li
      data-frozen={frozen ? "true" : undefined}
      aria-busy={frozen || undefined}
      className={cn(
        "rounded-lg border border-zinc-200 p-3 dark:border-zinc-800",
        frozen &&
          "pointer-events-none bg-zinc-100/65 opacity-75 dark:bg-zinc-900/55 dark:opacity-80",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 text-sm font-medium">{heading}</div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children ? <dl className="mt-2 space-y-1 text-xs">{children}</dl> : null}
    </li>
  );
}

type RowCardFieldProps = {
  label: string;
  className?: string;
  children: ReactNode;
};

export function RowCardField({ label, className, children }: RowCardFieldProps) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className={cn("min-w-0 flex-1", className)}>{children}</dd>
    </div>
  );
}
