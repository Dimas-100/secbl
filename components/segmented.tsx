import Link from "next/link";
import { cn } from "@/lib/utils";

// A link-based segmented control: no client state, the URL is the state, so
// the back button and sharing both work. Used for leaderboard scope.
export function Segmented({
  options,
  value,
  ariaLabel,
}: {
  options: { value: string; label: string; href: string }[];
  value: string;
  ariaLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel} className="bg-white/15 flex rounded-xl p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Link
            key={o.value}
            href={o.href}
            aria-current={active ? "page" : undefined}
            replace
            className={cn(
              "press flex h-9 flex-1 items-center justify-center rounded-lg text-xs font-semibold",
              active ? "bg-card text-foreground shadow-[var(--shadow-card)]" : "text-white/80"
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
