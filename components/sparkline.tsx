import { sparklinePath, sparklinePoints } from "@/lib/stats";
import { cn } from "@/lib/utils";

// The hero's rating line: oldest → newest, drawn once on load (the single
// page-load motion in the app; static under prefers-reduced-motion). Pure
// SVG rendered on the server. A soft area fill under the line gives it the
// weight of a real chart without axes or chrome.
export function Sparkline({
  ratings,
  width = 160,
  height = 44,
  className,
  id = "spark",
}: {
  ratings: number[];
  width?: number;
  height?: number;
  className?: string;
  id?: string;
}) {
  const points = sparklinePoints(ratings, width - 6, height - 10).map(
    ([x, y]) => [x + 3, y + 3] as [number, number]
  );
  if (points.length === 0) return null;
  const d = sparklinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  const area = `${d} L${last[0]} ${height} L${first[0]} ${height} Z`;
  const gradientId = `${id}-fill`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Rating over your last ${ratings.length} rated matches`}
      className={cn("overflow-visible", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} className="sparkline-area" />
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
      <circle cx={last[0]} cy={last[1]} r={3.5} fill="currentColor" className="sparkline-dot" />
      <circle cx={last[0]} cy={last[1]} r={7} fill="currentColor" fillOpacity={0.2} className="sparkline-dot" />
    </svg>
  );
}
