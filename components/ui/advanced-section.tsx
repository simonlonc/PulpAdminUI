"use client";

import { ReactNode, useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "./cn";

type AdvancedSectionProps = {
  summary?: string;
  /** Fields inside that differ from their default; shown as "(N set)". */
  setCount?: number;
  /** A validation error inside the section; always forces it open. */
  hasError?: boolean;
  /** Open for a reason other than setCount, which already opens it. */
  openWhen?: boolean;
  className?: string;
  children: ReactNode;
};

export function AdvancedSection({
  summary = "Advanced",
  setCount = 0,
  hasError = false,
  openWhen = false,
  className,
  children,
}: AdvancedSectionProps) {
  const ref = useRef<HTMLDetailsElement>(null);
  const shouldOpen = hasError || openWhen || setCount > 0;

  // The condition only ever opens the section. A controlled `open` attribute
  // would also close it the moment the user resets a field to its default,
  // and would fight their own toggle.
  useEffect(() => {
    if (shouldOpen && ref.current) ref.current.open = true;
  }, [shouldOpen]);

  return (
    <details ref={ref} className={cn("group/advanced", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-zinc-600 outline-none hover:text-zinc-900 focus-visible:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 dark:focus-visible:text-zinc-100 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-4 transition-transform group-open/advanced:rotate-90"
          aria-hidden="true"
        />
        {setCount > 0 ? `${summary} (${setCount} set)` : summary}
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}
