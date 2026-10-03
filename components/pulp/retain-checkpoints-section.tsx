"use client";

import { AdvancedSection } from "@/components/ui/advanced-section";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { RETAIN_CHECKPOINTS_MINIMUM, retainCheckpointsProblem } from "@/lib/repository-edit-form";

export type RetainCheckpointsSectionProps = {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
};

/**
 * The Advanced section every repository form shares, holding retain_checkpoints. The value is
 * kept as typed (not truncated) so a bad number stays on screen with its message instead of
 * being rewritten or dropped; the form's submit checks it with retainCheckpointsProblem.
 */
export function RetainCheckpointsSection({ value, onChange, disabled }: RetainCheckpointsSectionProps) {
  const problem = retainCheckpointsProblem(value);
  return (
    <AdvancedSection setCount={value === null ? 0 : 1} hasError={problem !== null}>
      <FormField label="Retain checkpoints (optional)">
        <Input
          type="number"
          min={RETAIN_CHECKPOINTS_MINIMUM}
          step={1}
          placeholder="Keep all"
          aria-invalid={problem !== null}
          disabled={disabled}
          value={value === null ? "" : value}
          onChange={(e) => {
            const v = e.target.value;
            const n = Number(v);
            onChange(v.trim() === "" || Number.isNaN(n) ? null : n);
          }}
        />
      </FormField>
      {problem ? (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {problem}
        </p>
      ) : null}
    </AdvancedSection>
  );
}
