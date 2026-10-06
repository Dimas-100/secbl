"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Home, Plus, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Home", icon: Home, raised: false },
  { href: "/events", label: "Events", icon: CalendarDays, raised: false },
  // Report is the raised gold center action — the reason the bar exists.
  { href: "/matches/new", label: "Report", icon: Plus, raised: true },
  { href: "/tournaments", label: "Cups", icon: Trophy, raised: false },
  { href: "/leaderboard", label: "Ranks", icon: BarChart3, raised: false },
] as const;

export function TabBar() {
  const pathname = usePathname();
  // Section prefixes keep the tab lit on detail pages (/events/123 → Events).
  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="bg-surface-dark fixed inset-x-0 bottom-0 z-10">
      <div className="mx-auto flex max-w-3xl items-center justify-around pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {TABS.map(({ href, label, icon: Icon, raised }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(href) ? "page" : undefined}
            className={cn(
              "press flex min-w-14 flex-col items-center gap-0.5 text-[10px] font-semibold",
              raised
                ? "-mt-7 text-surface-dark-foreground/70"
                : active(href)
                  ? "text-gold"
                  : "text-surface-dark-foreground/50"
            )}
          >
            {raised ? (
              <span className="bg-gold text-gold-foreground flex size-14 items-center justify-center rounded-full shadow-[var(--shadow-raised)]">
                <Icon className="size-7" />
              </span>
            ) : (
              <Icon className="size-5" />
            )}
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
