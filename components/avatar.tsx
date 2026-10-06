/* eslint-disable @next/next/no-img-element */
import { ballFor, ballStyle } from "@/lib/identity";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-sm",
  lg: "size-12 text-lg",
  xl: "size-20 text-3xl",
} as const;

export interface AvatarIdentity {
  id: string;
  display_name: string | null | undefined;
  avatar_url?: string | null;
  ball?: number | null;
}

// A member's face in the app: their photo when they've added one, otherwise
// their ball — the colour they picked from the rack (or a stable one from
// their id). An optional ring carries the school colour.
export function Avatar({
  person,
  size = "md",
  ring,
  className,
}: {
  person: AvatarIdentity;
  size?: keyof typeof SIZES;
  ring?: string | null;
  className?: string;
}) {
  const initial = (person.display_name ?? "?").trim()[0]?.toUpperCase() ?? "?";
  const ringStyle = ring ? { boxShadow: `0 0 0 2px var(--card), 0 0 0 4px ${ring}` } : undefined;
  if (person.avatar_url) {
    return (
      <img
        src={person.avatar_url}
        alt=""
        width={80}
        height={80}
        loading="lazy"
        style={ringStyle}
        className={cn("shrink-0 rounded-full object-cover", SIZES[size], className)}
      />
    );
  }
  const ball = ballFor(person.ball, person.id);
  return (
    <span
      aria-hidden="true"
      style={{ ...ballStyle(ball), ...ringStyle }}
      className={cn("flex shrink-0 items-center justify-center rounded-full font-extrabold", SIZES[size], className)}
    >
      {initial}
    </span>
  );
}
