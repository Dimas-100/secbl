"use client";

import { stepScore } from "@/lib/report-form";
import { cn } from "@/lib/utils";

// The at-the-table score control: big numeral, ≥44px tap targets, no
// keyboard. Used by match reporting and tournament result entry.
export function ScoreStepper({
  label,
  value,
  onChange,
  accent = false,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  accent?: boolean;
}) {
  const btn =
    "flex h-11 flex-1 items-center justify-center rounded-lg text-xl font-bold";
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center rounded-xl p-3 shadow-[var(--shadow-card)]",
        accent ? "bg-primary text-primary-foreground" : "bg-card"
      )}
    >
      <span
        className={cn(
          "max-w-full truncate text-xs font-bold",
          accent ? "text-primary-foreground/80" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
      <span className={cn("stat-number text-4xl", accent && "text-gold")}>{value}</span>
      <div className="mt-2 flex w-full gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label} score`}
          onClick={() => onChange(stepScore(value, -1))}
          className={cn(btn, accent ? "bg-white/15" : "bg-muted text-foreground")}
        >
          −
        </button>
        <button
          type="button"
          aria-label={`Increase ${label} score`}
          onClick={() => onChange(stepScore(value, 1))}
          className={cn(btn, accent ? "bg-gold text-gold-foreground" : "bg-primary text-primary-foreground")}
        >
          +
        </button>
      </div>
    </div>
  );
}
