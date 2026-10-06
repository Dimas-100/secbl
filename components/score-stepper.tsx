"use client";

import { stepScore } from "@/lib/report-form";
import { cn } from "@/lib/utils";

// The at-the-table score control: a 72px numeral, a ghost − and a solid +
// at 44px. Used by match reporting and tournament result entry.
//
// In a race the numeral sits on a rail that fills toward the finish
// (`progress`), the leader's rail turns brass (`tone`), the buttons lock when
// the race is over (`canIncrement`/`canDecrement`), and the finish plays a
// win pop or a loss settle (`effect`).
export function ScoreStepper({
  label,
  value,
  onChange,
  canIncrement = true,
  canDecrement = true,
  progress,
  tone = null,
  effect = null,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  canIncrement?: boolean;
  canDecrement?: boolean;
  progress?: number;
  tone?: "lead" | "trail" | null;
  effect?: "win" | "loss" | null;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-3.5">
      <span className="text-muted-foreground max-w-full truncate text-[13px]">{label}</span>
      <span className="relative flex items-center justify-center">
        {effect === "win" && (
          <span
            aria-hidden="true"
            className="race-ring pointer-events-none absolute size-16 rounded-full shadow-[0_0_0_2px_var(--brass)]"
          />
        )}
        <span
          key={effect ?? "live"}
          className={cn("hero-number relative", effect === "win" && "race-win", effect === "loss" && "race-loss")}
        >
          {value}
        </span>
      </span>
      {progress !== undefined && (
        <span aria-hidden="true" className="bg-hairline-divider h-1 w-[72%] overflow-hidden rounded-full">
          <span
            className={cn(
              "block h-full rounded-full transition-[width] duration-300 ease-out",
              tone === "lead" ? "bg-brass" : "bg-foreground"
            )}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </span>
      )}
      <div className="flex gap-2.5">
        <button
          type="button"
          aria-label={`Decrease ${label} score`}
          disabled={!canDecrement}
          onClick={() => onChange(stepScore(value, -1))}
          className="press flex size-11 items-center justify-center rounded-full text-xl font-light shadow-[inset_0_0_0_1px_var(--hairline-ghost)] disabled:opacity-40"
        >
          −
        </button>
        <button
          type="button"
          aria-label={`Increase ${label} score`}
          disabled={!canIncrement}
          onClick={() => onChange(stepScore(value, 1))}
          className="press bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-full text-xl disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
