"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChevronLeft, X } from "lucide-react";
import { NAV_KEY, canGoBack, nextNavStack, parseNavStack } from "@/lib/nav-stack";
import { cn } from "@/lib/utils";

// Mounted once in the member layout. Keeps a per-tab trail of visited paths
// in sessionStorage; it writes storage only, never React state.
export function NavHistory() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      const stack = parseNavStack(sessionStorage.getItem(NAV_KEY));
      sessionStorage.setItem(NAV_KEY, JSON.stringify(nextNavStack(stack, pathname)));
    } catch {
      // Storage can be blocked; Back then just follows its fallback link.
    }
  }, [pathname]);
  return null;
}

// A sub-page's back control: returns to the previous in-app page when there
// is one, else follows `fallback` (deep link, push notification, fresh tab),
// so Back never leaves the app.
export function BackButton({
  fallback,
  label = "Back",
  icon = "chevron",
  className,
}: {
  fallback: string;
  label?: string;
  icon?: "chevron" | "close";
  className?: string;
}) {
  const router = useRouter();
  const Icon = icon === "close" ? X : ChevronLeft;
  return (
    <Link
      href={fallback}
      aria-label={label}
      onClick={(e) => {
        let back = false;
        try {
          back = canGoBack(parseNavStack(sessionStorage.getItem(NAV_KEY)));
        } catch {
          // fall through to the link
        }
        if (back) {
          e.preventDefault();
          router.back();
        }
      }}
      className={cn(
        "press flex size-11 shrink-0 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--hairline-strong)]",
        className
      )}
    >
      <Icon className="size-5" strokeWidth={1.7} />
    </Link>
  );
}
