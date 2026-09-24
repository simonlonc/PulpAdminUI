export function formatBytes(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "-";
  if (value === 0) return "0 B";
  if (value < 1) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const formatted = value / 1024 ** exp;
  // toFixed() itself renders in exponential notation for a magnitude >= 1e21; treat that as
  // outside the representable domain, the same as the guards above.
  if (formatted >= 1e21) return "-";
  return `${formatted.toFixed(exp === 0 ? 0 : 2)} ${units[exp]}`;
}
