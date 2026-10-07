/* eslint-disable @next/next/no-img-element */
import { ballFor, ballStyle } from "@/lib/identity";
import { OnlineDot } from "@/components/online-dot";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "size-[30px] text-[10px]",
  sm: "size-[38px] text-[12px]",
  md: "size-10 text-[13px]",
  lg: "size-12 text-sm",
  xl: "size-16 text-xl",
  podium: "size-20 text-2xl",
  "2xl": "size-32 text-[40px]",
} as const;

export interface AvatarIdentity {
  id: string;
  display_name: string | null | undefined;
  avatar_url?: string | null;
  ball?: number | null;
}

// A member's face in the app: their photo when they've added one, otherwise
// their ball. Every avatar carries a 1px hairline ring so photos sit on the
// dark ground; `ring` draws a double ring in a colour (podium, profile photo);
// `selected` is the brass pick ring.
export function Avatar({
  person,
  size = "md",
  ring,
  selected = false,
  className,
}: {
  person: AvatarIdentity;
  size?: keyof typeof SIZES;
  ring?: string | null;
  selected?: boolean;
  className?: string;
}) {
  const initial = (person.display_name ?? "?").trim()[0]?.toUpperCase() ?? "?";
  const gap = size === "2xl" ? 6 : 4;
  const boxShadow = selected
    ? "0 0 0 2px var(--background), 0 0 0 3px var(--brass)"
    : ring
      ? `0 0 0 1px ${ring}, 0 0 0 ${gap + 1}px var(--background), 0 0 0 ${gap + 2}px ${ring}`
      : "0 0 0 1px var(--hairline-strong)";
  const base = cn("shrink-0 rounded-full", SIZES[size]);
  // The wrapper carries the caller's classes (stack offsets, rings) and
  // anchors the online dot; the face itself keeps its size and shadow.
  const dot = size === "xs" || size === "sm" ? 8 : size === "md" || size === "lg" ? 10 : 12;
  const face = person.avatar_url ? (
    <img
      src={person.avatar_url}
      alt=""
      width={128}
      height={128}
      loading="lazy"
      style={{ boxShadow }}
      className={cn(base, "object-cover")}
    />
  ) : (
    <span
      aria-hidden="true"
      style={{ ...ballStyle(ballFor(person.ball, person.id)), boxShadow }}
      className={cn(base, "flex items-center justify-center font-semibold")}
    >
      {initial}
    </span>
  );
  return (
    <span className={cn("relative inline-flex shrink-0 rounded-full", className)}>
      {face}
      <OnlineDot id={person.id} size={dot} />
    </span>
  );
}
