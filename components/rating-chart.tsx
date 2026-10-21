import { Segmented } from "@/components/segmented";
import { cn } from "@/lib/utils";
import {
  CHART_RANGE_LABEL,
  chartAriaLabel,
  chartChangeLabel,
  chartEmptyLabel,
  type ChartRange,
  type ChartSeries,
} from "@/lib/you";

// The You page's rating chart (spec 2026-10-21-play-and-progress §5): the
// change over the range, a brass line oldest → newest with the peak (brass)
// and best win (win colour) marked and labelled, and the Month · Season · All
// picker. Server-rendered SVG, plain-data props, no client JS: the range lives
// in the URL. The chart is always 120px tall. The line is drawn in a fixed
// viewBox stretched to the width (non-scaling stroke, like the old sparkline);
// markers and labels sit on the outer SVG in px and %, so circles stay round
// and text never scales on a wide screen.
const H = 120;
const LINE_W = 1000; // the line's viewBox width; x is a share of it
const PAD_TOP = 22; // room for the peak label above its marker
const PAD_BOTTOM = 22; // room for the best-win label below its marker
const R = 4;

const round = (n: number) => Number(n.toFixed(2));

// Labels near an edge grow inward so they never clip.
function anchorFor(pct: number): { textAnchor: "start" | "middle" | "end"; dx: number } {
  if (pct < 20) return { textAnchor: "start", dx: -R };
  if (pct > 80) return { textAnchor: "end", dx: R };
  return { textAnchor: "middle", dx: 0 };
}

export function RatingChart({
  series,
  range,
  ranges,
  hrefFor,
  bestWin,
  whose = "your",
}: {
  series: ChartSeries;
  range: ChartRange;
  ranges: ChartRange[];
  hrefFor: Record<ChartRange, string>;
  bestWin: { index: number; label: string } | null;
  // "their" on someone else's page ("+42 since their first game").
  whose?: "your" | "their";
}) {
  const { points, change, peak } = series;
  const options = ranges.map((r) => ({ value: r, label: CHART_RANGE_LABEL[r], href: hrefFor[r] }));

  let chart: React.ReactNode;
  if (points.length < 2) {
    chart = (
      <p className="text-muted-foreground border-hairline-divider flex h-[120px] items-center justify-center border-b text-[13px]">
        {chartEmptyLabel(range)}
      </p>
    );
  } else {
    const ratings = points.map((p) => p.rating);
    const min = Math.min(...ratings);
    const max = Math.max(...ratings);
    const plotH = H - PAD_TOP - PAD_BOTTOM;
    const pct = (i: number) => round((i / (points.length - 1)) * 100);
    const y = (r: number) => round(max === min ? PAD_TOP + plotH / 2 : PAD_TOP + ((max - r) / (max - min)) * plotH);
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${round((pct(i) / 100) * LINE_W)} ${y(p.rating)}`).join(" ");
    const win = bestWin && bestWin.index < points.length ? bestWin : null;
    const shared = peak && win && peak.index === win.index;

    chart = (
      <div className="px-2">
        <svg
          width="100%"
          height={H}
          role="img"
          aria-label={chartAriaLabel(series, range)}
          className="block overflow-visible"
        >
          <line x1="0" y1={H - 0.5} x2="100%" y2={H - 0.5} stroke="var(--hairline-divider)" />
          <svg viewBox={`0 0 ${LINE_W} ${H}`} width="100%" height={H} preserveAspectRatio="none" overflow="visible">
            <path
              d={d}
              fill="none"
              stroke="var(--brass)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pathLength={1}
              className="sparkline-draw"
            />
          </svg>
          {peak && (
            <g className="sparkline-dot">
              {shared ? (
                // The best win was the peak: a brass ring around the win dot.
                <circle cx={`${pct(peak.index)}%`} cy={y(peak.rating)} r={R + 2.5} fill="none" stroke="var(--brass)" strokeWidth={1.5} />
              ) : (
                <circle cx={`${pct(peak.index)}%`} cy={y(peak.rating)} r={R} fill="var(--brass)" stroke="var(--background)" strokeWidth={2} />
              )}
              <text
                x={`${pct(peak.index)}%`}
                y={y(peak.rating) - (shared ? 11 : 9)}
                {...anchorFor(pct(peak.index))}
                className="fill-muted-foreground stat-number text-[11px]"
              >
                {`peak ${peak.rating}`}
              </text>
            </g>
          )}
          {win && (
            <g className="sparkline-dot">
              <circle
                cx={`${pct(win.index)}%`}
                cy={y(points[win.index].rating)}
                r={R}
                fill="var(--win)"
                stroke="var(--background)"
                strokeWidth={2}
              />
              <text
                x={`${pct(win.index)}%`}
                y={y(points[win.index].rating) + 18}
                {...anchorFor(pct(win.index))}
                className="fill-muted-foreground text-[11px]"
              >
                {win.label}
              </text>
            </g>
          )}
        </svg>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {change !== null && (
        <p className={cn("stat-number text-[13px]", change >= 0 ? "text-win" : "text-loss")}>
          {chartChangeLabel(change, range, whose)}
        </p>
      )}
      {chart}
      <Segmented options={options} value={range} ariaLabel="Rating chart range" />
    </div>
  );
}
