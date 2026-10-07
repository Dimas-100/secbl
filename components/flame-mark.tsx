import { cn } from "@/lib/utils";

// The streak flame from the rank-badge set (docs/design/rank-badges/extras):
// a brass flame with a dark inner tongue, gold once a streak blazes.
const OUTER =
  "M24 5.5C26.4 12.8 35.5 18 35.5 29.5C35.5 37.8 30.2 43.5 24 43.5C17.8 43.5 12.5 37.8 12.5 30.5C12.5 24.4 15.8 20.6 18.6 18C18.7 21.8 20.2 24.4 22.2 25.2C20.8 18.4 21.8 11.2 24 5.5Z";
const INNER =
  "M24 25.5C25.6 29.4 29.6 31.2 29.6 35.2C29.6 38.6 27.2 40.5 24 40.5C20.8 40.5 18.4 38.6 18.4 35.8C18.4 33 20.2 31.4 21.6 30.2C21.9 32 22.7 33 23.7 33.2C23.2 30.6 23.3 27.8 24 25.5Z";

export function FlameMark({
  tone = "brass",
  size = 18,
  className,
}: {
  tone?: "brass" | "gold";
  size?: number;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className={cn("shrink-0", className)}>
      <path d={OUTER} fill={tone === "gold" ? "var(--gold)" : "var(--brass)"} />
      <path d={INNER} fill={tone === "gold" ? "#2E2811" : "#2A2317"} />
    </svg>
  );
}
