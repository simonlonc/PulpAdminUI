"use client";

import { cn } from "@/components/ui/cn";

/** Ported from app/roles/list/page.tsx's paginationItems (page buttons with ellipsis). */
function paginationItems(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 1) {
    return [1];
  }
  const delta = 2;
  const range: number[] = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      range.push(i);
    }
  }
  const out: (number | "ellipsis")[] = [];
  let prev: number | undefined;
  for (const i of range) {
    if (prev !== undefined && i - prev > 1) {
      out.push("ellipsis");
    }
    out.push(i);
    prev = i;
  }
  return out;
}

const paginationBtnBase =
  "inline-flex min-w-[2.25rem] items-center justify-center rounded-md px-2 py-1.5 text-sm transition-opacity";

function PaginationButton({
  page,
  label,
  disabled,
  active,
  onPageChange,
}: {
  page: number | null;
  label: string;
  disabled?: boolean;
  active?: boolean;
  onPageChange: (page: number) => void;
}) {
  if (page === null || disabled) {
    return (
      <span
        className={cn(
          paginationBtnBase,
          "cursor-not-allowed border border-zinc-300 opacity-40 dark:border-zinc-700"
        )}
        aria-disabled
      >
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onPageChange(page)}
      className={cn(
        paginationBtnBase,
        active
          ? "bg-black text-white dark:bg-white dark:text-black"
          : "border border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900/80",
        active && "pointer-events-none"
      )}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </button>
  );
}

export type ListPaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
};

/** Page buttons with ellipsis, driven by usePulpListQuery's setPage. */
export function ListPagination({ page, totalPages, onPageChange, disabled }: ListPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = paginationItems(page, totalPages);

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Pagination">
      <PaginationButton
        page={page > 1 ? page - 1 : null}
        label="«"
        disabled={page <= 1 || disabled}
        onPageChange={onPageChange}
      />
      {pages.map((item, idx) =>
        item === "ellipsis" ? (
          <span key={`e-${idx}`} className="px-2 text-zinc-400 dark:text-zinc-500" aria-hidden>
            …
          </span>
        ) : (
          <PaginationButton
            key={item}
            page={item}
            label={String(item)}
            active={item === page}
            disabled={disabled}
            onPageChange={onPageChange}
          />
        )
      )}
      <PaginationButton
        page={page < totalPages ? page + 1 : null}
        label="»"
        disabled={page >= totalPages || disabled}
        onPageChange={onPageChange}
      />
    </nav>
  );
}
