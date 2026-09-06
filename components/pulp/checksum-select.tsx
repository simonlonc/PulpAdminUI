"use client";

import { FormField } from "@/components/ui/form-field";
import { checksumAlgorithms } from "@/lib/repository-edit-form";

const selectClass =
  "w-full max-w-md rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export function ChecksumSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <FormField label={label}>
      <select
        className={selectClass}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      >
        <option value="">(none)</option>
        {checksumAlgorithms.map((alg) => (
          <option key={alg} value={alg}>
            {alg}
          </option>
        ))}
      </select>
    </FormField>
  );
}
