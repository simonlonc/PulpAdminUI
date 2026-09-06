"use client";

import { useEffect, useRef } from "react";

export type ActivityPhase = "running" | "done" | "failed";

export type ActivityLine = {
  id: string;
  label: string;
  phase: ActivityPhase;
  detail?: string;
};

export function ActivityLog({ lines }: { lines: ActivityLine[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lines]);

  return (
    <div ref={scrollRef} className="max-h-64 overflow-y-auto rounded-md border border-zinc-200/80 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
      <ul className="space-y-2.5 font-mono text-xs leading-relaxed">
      {lines.map((line) => (
        <li
          key={line.id}
          className="border-l-2 border-zinc-200 pl-3 dark:border-zinc-700"
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className={
                line.phase === "running"
                  ? "text-amber-600 dark:text-amber-400"
                  : line.phase === "done"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
              }
              aria-hidden
            >
              {line.phase === "running" ? "…" : line.phase === "done" ? "ok" : "!"}
            </span>
            <span className="text-zinc-800 dark:text-zinc-200">{line.label}</span>
          </div>
          {line.detail ? (
            <p className="mt-1 break-all text-[11px] text-zinc-500 dark:text-zinc-400">{line.detail}</p>
          ) : null}
        </li>
      ))}
      </ul>
    </div>
  );
}
