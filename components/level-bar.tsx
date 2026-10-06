import { cn } from "@/lib/utils";

// The 2px progress line under a level: hairline track, brass fill.
export function LevelBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn("bg-hairline-divider h-0.5 w-full", className)}
    >
      <div className="bg-brass h-full" style={{ width: `${pct}%` }} />
    </div>
  );
}
