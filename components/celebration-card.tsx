"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { Avatar, type AvatarIdentity } from "@/components/avatar";
import { LevelBar } from "@/components/level-bar";
import { TitleBadge } from "@/components/title-badge";
import { DISMISSED_KEY, dismissedIds, withDismissed } from "@/lib/celebration";
import type { TitleName } from "@/lib/levels";
import { cn } from "@/lib/utils";

export interface CelebrationProps {
  matchId: string;
  won: boolean;
  headline: string;
  opponent: AvatarIdentity;
  ratingBefore: number;
  ratingAfter: number;
  // XP this game earned (0 when capped), and the level bar after it.
  xpEarned: number;
  xpCapped: boolean;
  level: number;
  intoLevel: number;
  needed: number;
  badge: TitleName | null;
  streak: number | null;
}

const COUNT_MS = 1100;

// The result moment. Shown at the top of Home for the newest confirmed game
// this device has not dismissed: the rating counts to its new value, the XP
// bar fills by what the game earned, a badge unlocked or a streak mark gets
// its line. Reduced motion jumps straight to the end state.
export function CelebrationCard(p: CelebrationProps) {
  // Hidden until the dismissed list has been read, so a card never flashes
  // and vanishes for someone who already closed it.
  const [show, setShow] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    try {
      if (dismissedIds(localStorage.getItem(DISMISSED_KEY)).includes(p.matchId)) return;
    } catch {
      // Private mode: show it; it will show again next time, which is fine.
    }
    // Reveal on the next frame (not synchronously in the effect), then count.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) {
        start = t;
        setShow(true);
        if (reduced) {
          setProgress(1);
          return;
        }
      }
      const x = Math.min(1, (t - start) / COUNT_MS);
      // Ease out: fast start, settles on the number.
      setProgress(1 - (1 - x) * (1 - x));
      if (x < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [p.matchId]);

  if (!show) return null;

  const delta = p.ratingAfter - p.ratingBefore;
  const rating = Math.round(p.ratingBefore + delta * progress);
  const barFrom = Math.max(0, p.intoLevel - p.xpEarned);
  const bar = Math.round(barFrom + (p.intoLevel - barFrom) * progress);

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, withDismissed(localStorage.getItem(DISMISSED_KEY), p.matchId));
    } catch {
      // ignore
    }
    setShow(false);
  }

  return (
    <section
      aria-label="Latest result"
      className={cn(
        "bg-card flex flex-col gap-4 rounded-[20px] p-5 shadow-[inset_0_0_0_1px_var(--hairline-row)]",
        p.badge && "shadow-[inset_0_0_0_1px_var(--gold)]"
      )}
    >
      <div className="flex items-center gap-3.5">
        <Avatar person={p.opponent} size="lg" ring={p.won ? "var(--win)" : null} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="eyebrow">Result in</span>
          <h2 className={cn("truncate text-[20px] leading-tight font-semibold tracking-[-0.01em]", !p.won && "text-muted-foreground")}>
            {p.headline}
          </h2>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="stat-number text-[28px] leading-none">{rating}</span>
          <span className={cn("stat-number text-[13px]", delta >= 0 ? "text-win" : "text-loss")}>
            {delta >= 0 ? "+" : "−"}
            {Math.abs(delta)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-muted-foreground flex items-center justify-between text-[12px]">
          <span>Level {p.level}</span>
          <span className={cn(p.xpCapped ? "" : "text-brass")}>{p.xpCapped ? "No XP · weekly limit" : `+${p.xpEarned} XP`}</span>
        </div>
        <LevelBar value={bar} max={p.needed} />
      </div>

      {(p.badge || p.streak) && (
        <div className="flex items-center gap-3">
          {p.badge && (
            <>
              <TitleBadge title={p.badge} size={40} />
              <span className="flex flex-col">
                <span className="text-gold text-[12px] tracking-[0.06em] uppercase">Badge unlocked</span>
                <span className="text-[15px] font-medium">{p.badge}</span>
              </span>
            </>
          )}
          {p.streak && (
            <span className="text-brass ml-auto flex items-center gap-1 text-[15px] font-medium">
              <Flame className="size-[18px]" strokeWidth={2} aria-hidden="true" />
              {p.streak} in a row
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={dismiss}
        className="press self-end rounded-full px-4 py-2 text-[13px] font-medium shadow-[inset_0_0_0_1px_var(--hairline-ghost)]"
      >
        Nice
      </button>
    </section>
  );
}
