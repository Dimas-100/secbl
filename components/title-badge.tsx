import type { TitleName } from "@/lib/levels";
import { cn } from "@/lib/utils";

// The six title badges, from the rank-badge set designed 2026-10-07
// (sources in docs/design/rank-badges/). A medallion in a material that
// climbs with the ladder: hairline ring, solid disc, the glyph struck into it
// in a dark tone — the "struck" set, which stays legible at the 20px row mark.
// A locked badge is the "inlaid" set at low opacity: dark disc, the glyph in
// the material, so what is still to earn reads as hollow.
//
//   Rookie   grey      a single ball
//   Regular  bronze    the rack
//   Shark    silver    a fin
//   Hustler  brass     a cue crossing a ball
//   Master   gold      a crown
//   Legend   platinum  a star, with a brass outer ring

const RING = "M0 24a24 24 0 1 0 48 0a24 24 0 1 0 -48 0ZM2.5 24a21.5 21.5 0 1 1 43 0a21.5 21.5 0 1 1 -43 0Z";
const DISC = "M5.5 24a18.5 18.5 0 1 0 37 0a18.5 18.5 0 1 0 -37 0Z";

// Each glyph is a list of paths in two tones: "a" is struck (dark on the
// material disc), "b" is the material itself, so the inlaid set is the same
// drawing with the tones swapped.
type Tone = "a" | "b";
interface Badge {
  ring: string;
  material: string;
  dark: string;
  glyph: { d: string; tone: Tone }[];
}

const BADGES: Record<TitleName, Badge> = {
  Rookie: {
    ring: "var(--muted-foreground)",
    material: "var(--muted-foreground)",
    dark: "#1E2023",
    glyph: [
      { d: "M15 24a9 9 0 1 0 18 0a9 9 0 1 0 -18 0Z", tone: "a" },
      { d: "M18.8 22.4a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0Z", tone: "b" },
    ],
  },
  Regular: {
    ring: "var(--podium-3)",
    material: "var(--podium-3)",
    dark: "#2B2019",
    glyph: [
      {
        d: "M20.85 17.59a3.15 3.15 0 1 0 6.3 0a3.15 3.15 0 1 0 -6.3 0ZM17.15 24a3.15 3.15 0 1 0 6.3 0a3.15 3.15 0 1 0 -6.3 0ZM24.55 24a3.15 3.15 0 1 0 6.3 0a3.15 3.15 0 1 0 -6.3 0ZM13.45 30.41a3.15 3.15 0 1 0 6.3 0a3.15 3.15 0 1 0 -6.3 0ZM20.85 30.41a3.15 3.15 0 1 0 6.3 0a3.15 3.15 0 1 0 -6.3 0ZM28.25 30.41a3.15 3.15 0 1 0 6.3 0a3.15 3.15 0 1 0 -6.3 0Z",
        tone: "a",
      },
    ],
  },
  Shark: {
    ring: "var(--podium-2)",
    material: "var(--podium-2)",
    dark: "#1C2026",
    glyph: [{ d: "M13.5 32.5C19 30.6 24.2 23 29 14.5C28.4 21.6 30 27.4 34.5 32.5Z", tone: "a" }],
  },
  Hustler: {
    ring: "var(--brass)",
    material: "var(--brass)",
    dark: "#2A2317",
    glyph: [
      { d: "M19.2 26.2a7 7 0 1 0 14 0a7 7 0 1 0 -14 0Z", tone: "a" },
      { d: "M14.51 38.58L37.9 13.64L34.36 10.1L9.42 33.49Z", tone: "b" },
      { d: "M14.51 36.31L35.64 13.64L34.36 12.36L11.69 33.49Z", tone: "a" },
    ],
  },
  Master: {
    ring: "var(--gold)",
    material: "var(--gold)",
    dark: "#2E2811",
    glyph: [
      {
        d: "M15.2 28L14.2 18.8L20 23.6L24 16.6L28 23.6L33.8 18.8L32.8 28ZM12.4 17.8a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0ZM22.2 15.4a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0ZM32 17.8a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0ZM16.2 30.4H31.8Q32.8 30.4 32.8 31.4V32.6Q32.8 33.6 31.8 33.6H16.2Q15.2 33.6 15.2 32.6V31.4Q15.2 30.4 16.2 30.4Z",
        tone: "a",
      },
    ],
  },
  Legend: {
    ring: "var(--brass)",
    material: "var(--foreground)",
    dark: "#24241F",
    glyph: [
      {
        d: "M24.00 13.80L26.76 21.20L34.65 21.54L28.47 26.45L30.58 34.06L24.00 29.70L17.42 34.06L19.53 26.45L13.35 21.54L21.24 21.20Z",
        tone: "a",
      },
    ],
  },
};

export function TitleBadge({
  title,
  size = 28,
  locked = false,
  decorative = false,
  className,
}: {
  title: TitleName;
  size?: 20 | 28 | 40 | 64;
  locked?: boolean;
  // True where the title is already written next to the badge.
  decorative?: boolean;
  className?: string;
}) {
  const b = BADGES[title];
  // Struck when earned; inlaid (tones swapped) when locked.
  const disc = locked ? b.dark : b.material;
  const toneFill = (t: Tone) => (t === "a" ? (locked ? b.material : b.dark) : locked ? b.dark : b.material);
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : `${title} badge${locked ? " (locked)" : ""}`}
      className={cn("shrink-0", locked && "opacity-40", className)}
    >
      <path d={RING} fill={b.ring} />
      <path d={DISC} fill={disc} />
      {b.glyph.map((g, i) => (
        <path key={i} d={g.d} fill={toneFill(g.tone)} />
      ))}
    </svg>
  );
}
