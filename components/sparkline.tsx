import { sparklinePath, sparklinePoints } from "@/lib/stats";
import { cn } from "@/lib/utils";

// The hero's rating line: oldest → newest, drawn once on load (the single
// page-load motion in the app; static under prefers-reduced-motion). Pure
// SVG rendered on the server — no chart library for one line.
export function Sparkline({
  ratings,
  width = 160,
  height = 44,
  className,
}: {
  ratings: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const points = sparklinePoints(ratings, width - 4, height - 4).map(
    ([x, y]) => [x + 2, y + 2] as [number, number]
  );
  if (points.length === 0) return null;
  const d = sparklinePath(points);
  const last = points[points.length - 1];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Rating over your last ${ratings.length} rated matches`}
      className={cn("overflow-visible", className)}
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="sparkline-draw"
      />
      <circle cx={last[0]} cy={last[1]} r={3} fill="currentColor" className="sparkline-dot" />
    </svg>
  );
}
