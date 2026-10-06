import { cn } from "@/lib/utils";

// One number, one plain label, optional one-line note. Four of these in a
// row are the "at a glance" layer under every hero (chess.com's stats strip).
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
        "bg-card flex min-w-0 flex-col gap-0.5 rounded-xl px-3 py-3 shadow-[var(--shadow-card)]",
        className
      )}
    >
      <span className="text-muted-foreground truncate text-xs font-medium">{label}</span>
      <span
        className={cn(
          "stat-number truncate text-[26px] leading-none",
          tone === "win" && "text-win",
          tone === "loss" && "text-loss",
          tone === "gold" && "text-primary"
        )}
      >
        {value}
      </span>
      {note && <span className="text-muted-foreground truncate text-[11px]">{note}</span>}
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-4">{children}</div>;
}
