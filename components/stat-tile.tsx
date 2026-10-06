import { cn } from "@/lib/utils";

// The at-a-glance layer: N cells divided by hairlines, a divider above. No
// card, no fill — the numbers carry it.
export function StatGrid({
  children,
  cols = 4,
  className,
}: {
  children: React.ReactNode;
  cols?: 3 | 4;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-hairline-divider grid border-t pt-[18px] [&>*+*]:border-l [&>*+*]:border-hairline-divider [&>*+*]:pl-4",
        cols === 3 ? "grid-cols-3" : "grid-cols-4",
        className
      )}
    >
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
  tone?: "default" | "win" | "loss" | "brass";
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span
        className={cn(
          "stat-number truncate text-[22px] leading-none font-normal",
          tone === "win" && "text-win",
          tone === "loss" && "text-loss",
          tone === "brass" && "text-brass"
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground truncate text-[12px]">{label}</span>
      {note && <span className="text-muted-foreground truncate text-[11px]">{note}</span>}
    </div>
  );
}
