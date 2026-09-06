"use client";

const selectClass =
  "w-full max-w-md rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export function RemoteSelect({
  value,
  remotes,
  onChange,
}: {
  value: string | null;
  remotes: { pulp_href: string; name: string; url: string }[];
  onChange: (v: string | null) => void;
}) {
  const hasCurrent = value === null || remotes.some((r) => r.pulp_href === value);
  return (
    <select
      className={selectClass}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
    >
      <option value="">(none)</option>
      {!hasCurrent && value !== null ? (
        <option value={value}>{value} (current)</option>
      ) : null}
      {remotes.map((remote) => (
        <option key={remote.pulp_href} value={remote.pulp_href}>
          {remote.name} — {remote.url}
        </option>
      ))}
    </select>
  );
}
