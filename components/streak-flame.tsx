import { Flame } from "lucide-react";
import { streakTier } from "@/lib/celebration";
import { cn } from "@/lib/utils";

// Your current win streak, beside your name on Home: nothing below 3, a
// flame that grows at 5 and 10, brass until it turns gold at 10.
export function StreakFlame({ length, className }: { length: number; className?: string }) {
  const tier = streakTier(length);
  if (tier === "none") return null;
  const size = tier === "blaze" ? "size-5" : tier === "hot" ? "size-[18px]" : "size-4";
  return (
    <span
      aria-label={`${length}-game win streak`}
      title={`${length}-game win streak`}
      className={cn(
        "stat-number inline-flex items-center gap-0.5 text-[12px] leading-none",
        tier === "blaze" ? "text-gold" : "text-brass",
        className
      )}
    >
      <Flame className={size} strokeWidth={2} aria-hidden="true" />
      {length}
    </span>
  );
}
