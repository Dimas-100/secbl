import { cn } from "@/lib/utils";

// The 2px progress line under a level: hairline track, brass fill. `label`
// names the bar for assistive tech ("Level 4 progress"); a progressbar needs
// an accessible name.
export function LevelBar({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label?: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn("bg-hairline-divider h-0.5 w-full", className)}
    >
      <div className="bg-brass h-full" style={{ width: `${pct}%` }} />
    </div>
  );
}
