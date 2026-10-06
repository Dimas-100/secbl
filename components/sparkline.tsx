import { sparklinePath, sparklinePoints } from "@/lib/stats";
import { cn } from "@/lib/utils";

// The rating line: oldest → newest, a 1.6px brass stroke with an end dot over
// a hairline baseline. Drawn once on load (the single page-load motion in the
// app; static under prefers-reduced-motion). Pure SVG rendered on the server.
// preserveAspectRatio="none" + non-scaling strokes let it fill any width
// without fattening the line.
export function Sparkline({
  ratings,
  width = 342,
  height = 56,
  className,
}: {
  ratings: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const points = sparklinePoints(ratings, width - 6, height - 12).map(
    ([x, y]) => [x + 3, y + 4] as [number, number]
  );
  if (points.length === 0) return null;
  const d = sparklinePath(points);
  const last = points[points.length - 1];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Rating over your last ${ratings.length} rated matches`}
      className={cn("text-brass block overflow-visible", className)}
    >
      <line
        x1={0}
        y1={height - 0.5}
        x2={width}
        y2={height - 0.5}
        stroke="var(--hairline-divider)"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        className="sparkline-draw"
      />
      <circle cx={last[0]} cy={last[1]} r={3} fill="currentColor" className="sparkline-dot" />
    </svg>
  );
}
