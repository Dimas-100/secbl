import { cn } from "@/lib/utils";

// The at-a-glance layer under a hero. One card, numbers side by side,
// separated by hairlines: an editorial stats strip rather than four boxes.
export function StatStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card grid grid-cols-2 overflow-hidden rounded-2xl shadow-[var(--shadow-card)] ring-1 ring-hairline min-[400px]:grid-cols-4">
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  note,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  tone?: "default" | "win" | "loss" | "gold";
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Hairline between cells on both axes; the strip's overflow-hidden
        // trims the outer edges so no stray rule shows.
        "flex min-w-0 flex-col gap-1 px-4 py-4 -ml-px -mt-px border-l border-t border-hairline",
        className
      )}
    >
      <span className="text-muted-foreground truncate text-xs">{label}</span>
      <span
        className={cn(
          "stat-number truncate text-[26px] leading-none",
          tone === "win" && "text-win",
          tone === "loss" && "text-loss",
          tone === "gold" && "text-brass-deep"
        )}
      >
        {value}
      </span>
      {note && <span className="text-muted-foreground truncate text-[11px]">{note}</span>}
    </div>
  );
}

// Kept for callers that still lay tiles out as separate cards.
export function StatGrid({ children }: { children: React.ReactNode }) {
  return <StatStrip>{children}</StatStrip>;
}
