import Link from "next/link";
import { cn } from "@/lib/utils";

// Link-based underline tabs: the URL is the state, so back and share work.
// Selected = primary text with a 1px underline sitting on the divider.
export function UnderlineTabs({
  options,
  value,
  ariaLabel,
}: {
  options: { value: string; label: string; href: string }[];
  value: string;
  ariaLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel} className="border-hairline-divider flex gap-6 overflow-x-auto border-b">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Link
            key={o.value}
            href={o.href}
            replace
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex h-11 shrink-0 items-center border-b text-[15px] whitespace-nowrap",
              active ? "border-foreground text-foreground font-medium" : "text-tab-inactive border-transparent"
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </nav>
  );
}
