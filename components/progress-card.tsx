import Link from "next/link";
import { LevelBar } from "@/components/level-bar";
import { PLACEMENT_GAMES } from "@/lib/home";
import type { LevelInfo } from "@/lib/levels";
import { cn } from "@/lib/utils";

// "Placement games · k of 10" over ten dots, k filled in brass. Shared with
// the first-game card, where k is 0.
export function PlacementRow({ played }: { played: number }) {
  const filled = Math.min(Math.max(played, 0), PLACEMENT_GAMES);
  return (
    <div className="flex flex-col gap-2">
      <div className="text-muted-foreground flex justify-between gap-3 text-[12px]">
        <span>Placement games</span>
        <span className="stat-number">{`${filled} of ${PLACEMENT_GAMES}`}</span>
      </div>
      <div aria-hidden="true" className="flex gap-1.5">
        {Array.from({ length: PLACEMENT_GAMES }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-3.5 rounded-full",
              i < filled ? "bg-brass" : "shadow-[inset_0_0_0_1.5px_var(--hairline-ghost)]"
            )}
          />
        ))}
      </div>
    </div>
  );
}

// Home's one block of progress (spec 2026-10-21-play-and-progress §2): the
// rating and its month, the last five results (or placement while fewer than
// ten games count), the level with its XP bar, and one Next goal. The whole
// card opens the member's own page. Plain data in; lib/home.ts writes the copy.
export function ProgressCard({
  meId,
  rating,
  change,
  form,
  played,
  level,
  xpNote,
  next,
}: {
  meId: string;
  rating: number;
  change: number | null;
  // Oldest first, so the newest result sits on the right.
  form: ("W" | "L")[];
  played: number;
  level: Pick<LevelInfo, "level" | "title" | "intoLevel" | "needed">;
  xpNote: string;
  next: string | null;
}) {
  const placing = played < PLACEMENT_GAMES;
  // "Next: pass Jordan for #2 · 18 pts": the goal reads in full colour, the
  // distance after the first " · " is muted.
  const [head, ...rest] = next ? next.split(" · ") : [];
  const tail = rest.join(" · ");

  return (
    <Link
      href={`/players/${meId}`}
      className="press bg-card flex flex-col gap-4 rounded-[20px] p-4 shadow-[inset_0_0_0_1px_var(--hairline-row)]"
    >
      <div className="flex items-end justify-between gap-4">
        <span className="flex flex-col gap-1">
          <span className="eyebrow">Rating</span>
          <span className="stat-number text-[40px] leading-[1.05]">{rating}</span>
        </span>
        <span className="flex flex-col items-end gap-2 pb-1">
          {change !== null && (
            <span className={cn("stat-number text-[13px]", change >= 0 ? "text-win" : "text-loss")}>
              {`${change >= 0 ? "+" : "−"}${Math.abs(change)} this month`}
            </span>
          )}
          {!placing && form.length > 0 && (
            <span
              role="img"
              aria-label={`Last ${form.length}, oldest first: ${form.map((r) => (r === "W" ? "won" : "lost")).join(", ")}`}
              className="flex gap-1"
            >
              {form.map((r, i) => (
                <span
                  key={i}
                  className={cn(
                    "size-3.5 rounded-full",
                    r === "W" ? "bg-win" : "shadow-[inset_0_0_0_1.5px_var(--loss)]"
                  )}
                />
              ))}
            </span>
          )}
        </span>
      </div>

      {placing && <PlacementRow played={played} />}

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="min-w-0">
            <span className="font-medium">Level {level.level}</span>
            <span className="text-brass"> · {level.title}</span>
          </span>
          <span className="text-muted-foreground stat-number shrink-0">{xpNote}</span>
        </div>
        <LevelBar value={level.intoLevel} max={level.needed} />
      </div>

      {next && (
        <p className="border-hairline-row border-t pt-3 text-[13px] leading-snug">
          {head}
          {tail && <span className="text-muted-foreground"> · {tail}</span>}
        </p>
      )}
    </Link>
  );
}
