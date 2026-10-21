import Link from "next/link";
import { cn } from "@/lib/utils";

// A link-based pill segmented control on the card track: no client state,
// the URL is the state, so the back button and sharing both work. scroll
// passes through to Link: false keeps the page where it is when the control
// sits below the fold (Next scrolls to the page's top whenever that top is
// out of view, which on a phone is most of the time).
export function Segmented({
  options,
  value,
  ariaLabel,
  className,
  scroll = true,
}: {
  options: { value: string; label: string; href: string }[];
  value: string;
  ariaLabel: string;
  className?: string;
  scroll?: boolean;
}) {
  return (
    <nav aria-label={ariaLabel} className={cn("bg-card flex rounded-full p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Link
            key={o.value}
            href={o.href}
            aria-current={active ? "page" : undefined}
            replace
            scroll={scroll}
            className={cn(
              "press flex h-9 flex-1 items-center justify-center rounded-full px-3 text-[13px] whitespace-nowrap",
              active ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground font-medium"
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
