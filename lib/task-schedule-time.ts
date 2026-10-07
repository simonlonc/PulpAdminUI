/** Largest two non-zero units of a span, e.g. "3h 12m", "2d 4h", "45s". */
export function formatSpan(ms: number): string {
  const total = Math.floor(Math.abs(ms) / 1000);
  const units: [string, number][] = [
    ["d", Math.floor(total / 86400)],
    ["h", Math.floor((total % 86400) / 3600)],
    ["m", Math.floor((total % 3600) / 60)],
    ["s", total % 60],
  ];
  const parts = units.filter(([, n]) => n > 0).slice(0, 2);
  return parts.length === 0 ? "0s" : parts.map(([u, n]) => `${n}${u}`).join(" ");
}

/** "in 3h 12m" for a future timestamp, "overdue by 5m" for a past one, "" if unparseable. */
export function formatNextDispatchCountdown(iso: string | null, now: number): string {
  if (!iso) return "";
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "";
  const diff = target - now;
  return diff > 0 ? `in ${formatSpan(diff)}` : `overdue by ${formatSpan(diff)}`;
}

/** finished_at - started_at as a span, or null when either is missing/invalid or negative. */
export function formatTaskDuration(startedAt: string | null, finishedAt: string | null): string | null {
  if (!startedAt || !finishedAt) return null;
  const diff = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  return Number.isNaN(diff) || diff < 0 ? null : formatSpan(diff);
}
