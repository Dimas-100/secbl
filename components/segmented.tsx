import Link from "next/link";
import { cn } from "@/lib/utils";

// A link-based pill segmented control on the card track: no client state,
// the URL is the state, so the back button and sharing both work.
export function Segmented({
  options,
  value,
  ariaLabel,
  className,
}: {
  options: { value: string; label: string; href: string }[];
  value: string;
  ariaLabel: string;
  className?: string;
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
