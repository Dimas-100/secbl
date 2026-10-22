"use client";

import { stepScore } from "@/lib/report-form";
import { cn } from "@/lib/utils";

// The at-the-table score control: a 72px numeral, a ghost − and a solid +
// at 44px. Used by match reporting and tournament result entry. `size="lg"`
// is the live scoreboard once its setup has folded away: a 104px numeral, a
// 48px − and a 56px +, for tapping at the table.
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
  size = "md",
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  canIncrement?: boolean;
  canDecrement?: boolean;
  progress?: number;
  tone?: "lead" | "trail" | null;
  effect?: "win" | "loss" | null;
  size?: "md" | "lg";
}) {
  const lg = size === "lg";
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col items-center", lg ? "gap-5" : "gap-3.5")}>
      <span className={cn("text-muted-foreground max-w-full truncate", lg ? "text-[15px]" : "text-[13px]")}>{label}</span>
      <span className="relative flex items-center justify-center">
        {effect === "win" && (
          <span
            aria-hidden="true"
            className={cn(
              "race-ring pointer-events-none absolute rounded-full shadow-[0_0_0_2px_var(--brass)]",
              lg ? "size-24" : "size-16"
            )}
          />
        )}
        <span
          key={effect ?? "live"}
          className={cn("hero-number relative", effect === "win" && "race-win", effect === "loss" && "race-loss")}
          // Inline, not a text-[…] class: hero-number sets the size too, and
          // which utility wins would come down to stylesheet order.
          style={lg ? { fontSize: 104 } : undefined}
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
      <div className={cn("flex items-center", lg ? "gap-3" : "gap-2.5")}>
        <button
          type="button"
          aria-label={`Decrease ${label} score`}
          disabled={!canDecrement}
          onClick={() => onChange(stepScore(value, -1))}
          className={cn(
            "press flex items-center justify-center rounded-full font-light shadow-[inset_0_0_0_1px_var(--hairline-ghost)] disabled:opacity-40",
            lg ? "size-12 text-2xl" : "size-11 text-xl"
          )}
        >
          −
        </button>
        <button
          type="button"
          aria-label={`Increase ${label} score`}
          disabled={!canIncrement}
          onClick={() => onChange(stepScore(value, 1))}
          className={cn(
            "press bg-primary text-primary-foreground flex items-center justify-center rounded-full disabled:opacity-40",
            lg ? "size-14 text-2xl" : "size-11 text-xl"
          )}
        >
          +
        </button>
      </div>
    </div>
  );
}
