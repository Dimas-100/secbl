"use client";

import { stepScore } from "@/lib/report-form";

// The at-the-table score control: a 72px numeral, a ghost − and a solid +
// at 44px. Used by match reporting and tournament result entry.
export function ScoreStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-3.5">
      <span className="text-muted-foreground max-w-full truncate text-[13px]">{label}</span>
      <span className="hero-number">{value}</span>
      <div className="flex gap-2.5">
        <button
          type="button"
          aria-label={`Decrease ${label} score`}
          onClick={() => onChange(stepScore(value, -1))}
          className="press flex size-11 items-center justify-center rounded-full text-xl font-light shadow-[inset_0_0_0_1px_var(--hairline-ghost)]"
        >
          −
        </button>
        <button
          type="button"
          aria-label={`Increase ${label} score`}
          onClick={() => onChange(stepScore(value, 1))}
          className="press bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-full text-xl"
        >
          +
        </button>
      </div>
    </div>
  );
}
