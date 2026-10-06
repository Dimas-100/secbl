"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Home, Plus, User } from "lucide-react";
import { cn } from "@/lib/utils";

// Home · Ranks · ＋ · Events · Profile. The ＋ sits in the bar (not floating);
// Cups lives under Events; Profile is the viewer's own player page. Hidden on
// Log a game, whose sticky footer takes the bar's place.
export function TabBar({ profileHref }: { profileHref: string }) {
  const pathname = usePathname();
  if (pathname.startsWith("/matches/new")) return null;

  const tabs = [
    { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
    {
      href: "/leaderboard",
      label: "Ranks",
      icon: BarChart3,
      match: (p: string) => p.startsWith("/leaderboard") || p.startsWith("/schools"),
    },
    { href: "/matches/new", label: "Log a game", icon: Plus, raised: true, match: () => false },
    {
      href: "/events",
      label: "Events",
      icon: CalendarDays,
      match: (p: string) => p.startsWith("/events") || p.startsWith("/tournaments"),
    },
    {
      href: profileHref,
      label: "Profile",
      icon: User,
      match: (p: string) => p === profileHref || p.startsWith("/settings"),
    },
  ];

  return (
    <nav aria-label="Main" className="bg-background border-hairline fixed inset-x-0 bottom-0 z-10 border-t">
      <div className="mx-auto flex max-w-3xl items-start justify-around px-2.5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {tabs.map(({ href, label, icon: Icon, raised, match }) => {
          if (raised) {
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                className="press bg-primary text-primary-foreground -mt-1.5 flex size-[50px] items-center justify-center rounded-full"
              >
                <Icon className="size-[22px]" strokeWidth={2} />
              </Link>
            );
          }
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "press flex min-h-11 w-[60px] flex-col items-center gap-[5px] text-[10px] font-medium tracking-[0.04em]",
                active ? "text-foreground" : "text-tab-inactive"
              )}
            >
              <Icon className="size-[22px]" strokeWidth={1.6} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
