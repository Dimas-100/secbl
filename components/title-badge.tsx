import type { TitleName } from "@/lib/levels";
import { cn } from "@/lib/utils";

// The six title badges (docs/superpowers/specs/2026-10-06-live-club-design.md
// §4): a medallion in a material that climbs with the ladder, each with its
// own glyph. Inline SVG so it scales from a 20px row mark to a 64px hero
// without a second asset, and so it paints in the theme's own tokens.
//
//   Rookie   grey      a single ball
//   Regular  bronze    the rack
//   Shark    silver    a fin
//   Hustler  brass     a cue crossing a ball
//   Master   gold      a crown
//   Legend   platinum  a star, with a brass outer ring

const MATERIAL: Record<TitleName, string> = {
  Rookie: "var(--muted-foreground)",
  Regular: "var(--podium-3)",
  Shark: "var(--podium-2)",
  Hustler: "var(--brass)",
  Master: "var(--gold)",
  Legend: "var(--foreground)",
};

function Glyph({ title, color }: { title: TitleName; color: string }) {
  switch (title) {
    case "Rookie":
      return (
        <>
          <circle cx="24" cy="24" r="7" fill={color} />
          <circle cx="21.5" cy="21.5" r="1.8" fill="var(--card)" opacity="0.9" />
        </>
      );
    case "Regular":
      return (
        <>
          <circle cx="24" cy="18" r="4.5" fill={color} />
          <circle cx="18.5" cy="28" r="4.5" fill={color} />
          <circle cx="29.5" cy="28" r="4.5" fill={color} />
        </>
      );
    case "Shark":
      return <path d="M14 32 C18 20, 24 14, 34 12 C30 20, 30 26, 34 32 Z" fill={color} />;
    case "Hustler":
      return (
        <>
          <line x1="12" y1="36" x2="34" y2="14" stroke={color} strokeWidth="3" strokeLinecap="round" />
          <circle cx="29" cy="29" r="6" fill={color} />
        </>
      );
    case "Master":
      return <path d="M12 32 L14 18 L21 25 L24 14 L27 25 L34 18 L36 32 Z" fill={color} />;
    case "Legend":
      return (
        <path
          d="M24 12 L27.3 20.4 L36.3 20.9 L29.3 26.6 L31.6 35.3 L24 30.4 L16.4 35.3 L18.7 26.6 L11.7 20.9 L20.7 20.4 Z"
          fill={color}
        />
      );
  }
}

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
  const color = MATERIAL[title];
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : `${title} badge${locked ? " (locked)" : ""}`}
      className={cn("shrink-0", locked && "opacity-35", className)}
    >
      {title === "Legend" && !locked && (
        <circle cx="24" cy="24" r="23" fill="none" stroke="var(--brass)" strokeWidth="1" />
      )}
      <circle
        cx="24"
        cy="24"
        r="21"
        fill="var(--card)"
        stroke={color}
        strokeWidth="1.5"
        strokeDasharray={locked ? "3 3" : undefined}
      />
      <circle cx="24" cy="24" r="17" fill="none" stroke={color} strokeWidth="1" opacity="0.45" />
      <Glyph title={title} color={color} />
    </svg>
  );
}
