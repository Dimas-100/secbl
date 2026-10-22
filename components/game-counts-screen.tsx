"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { ArrowDown, ArrowUp, CircleDot, Medal, Sparkles, Star } from "lucide-react";
import { joinLine } from "@/app/(member)/night/actions";
import { FlameMark } from "@/components/flame-mark";
import { LevelBar } from "@/components/level-bar";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { DISMISSED_KEY, dismissedIds, withDismissed } from "@/lib/celebration";
import { signedChange, xpRow } from "@/lib/result-moment";
import { cn } from "@/lib/utils";

export type GameCountsAction = { kind: "rematch"; href: string } | { kind: "back_in_line"; nightId: string };

// Plain data only: Home is a Server Component.
export interface GameCountsProps {
  matchId: string;
  won: boolean;
  headline: string;
  // "{game} · {format}"
  sub: string;
  ratingBefore: number;
  ratingAfter: number;
  // XP this game earned (0 when capped), and the level bar after it.
  xpEarned: number;
  xpCapped: boolean;
  level: number;
  intoLevel: number;
  needed: number;
  // At most three true "what changed" lines (lib/result-moment momentLines).
  lines: string[];
  action: GameCountsAction;
}

const COUNT_MS = 1100;

// The win glow from the approved mockup, and a neutral one for a loss.
const GLOW = {
  win: "radial-gradient(120% 60% at 50% 0%, color-mix(in srgb, var(--win) 14%, transparent), transparent 60%)",
  loss: "radial-gradient(120% 60% at 50% 0%, color-mix(in srgb, var(--foreground) 5%, transparent), transparent 60%)",
};

// The moment a game counts (spec 2026-10-21-play-and-progress §3): a
// full-screen dialog over Home for the newest confirmed game this device has
// not dismissed. The rating counts to its new value and the XP bar fills
// from where it was; reduced motion jumps straight to the end. Done, Rematch
// and Back in line all dismiss it on this device.
export function GameCountsScreen(p: GameCountsProps) {
  // Closed until the dismissed list has been read, so the screen never
  // flashes and vanishes for someone who already closed it.
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (dismissedIds(localStorage.getItem(DISMISSED_KEY)).includes(p.matchId)) return;
    } catch {
      // Private mode: show it; it will show again next time, which is fine.
    }
    // Open on the next frame (not synchronously in the effect), then count.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) {
        start = t;
        setOpen(true);
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

  function remember() {
    try {
      localStorage.setItem(DISMISSED_KEY, withDismissed(localStorage.getItem(DISMISSED_KEY), p.matchId));
    } catch {
      // Blocked storage: it shows once more next time.
    }
  }
  function done() {
    remember();
    setOpen(false);
  }

  const delta = p.ratingAfter - p.ratingBefore;
  const rating = Math.round(p.ratingBefore + delta * progress);
  const xp = xpRow(p);
  const bar = Math.round(xp.barFrom + (p.intoLevel - xp.barFrom) * progress);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Escape: the same as Done.
        if (!next) done();
      }}
    >
      <Dialog.Portal>
        {/* The overlay is the screen (Radix's scrollable-overlay pattern):
            it locks the page behind and scrolls on a short phone. */}
        <Dialog.Overlay
          className="bg-background fixed inset-0 z-40 overflow-y-auto overscroll-contain"
          style={{ backgroundImage: p.won ? GLOW.win : GLOW.loss }}
        >
          <Dialog.Content
            ref={content}
            // Named for what it is; the headline is its heading.
            aria-label="Latest result"
            aria-labelledby={undefined}
            aria-describedby={undefined}
            // Focus the screen itself, so it is read out and a stray Enter
            // cannot dismiss it or start a rematch.
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              content.current?.focus();
            }}
            // Full width and height, so there is no "outside" to tap by
            // accident; the column inside keeps a phone's measure.
            className="flex min-h-full w-full outline-none"
          >
            <div className="mx-auto flex w-full max-w-md flex-col px-6 pt-[calc(env(safe-area-inset-top)+3.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
              <div className="flex flex-col items-center gap-2 text-center">
                <span className={cn("eyebrow", p.won && "text-win")}>{p.won ? "Win" : "Loss"}</span>
                <Dialog.Title className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-balance">
                  {p.headline}
                </Dialog.Title>
                <p className="text-muted-foreground text-[13px]">{p.sub}</p>
              </div>

              <p className="mt-7 flex items-baseline justify-center gap-2.5">
                <span className="sr-only">
                  Rating {p.ratingBefore} to {p.ratingAfter},
                </span>
                <span aria-hidden="true" className="stat-number text-muted-foreground text-[22px]">
                  {p.ratingBefore}
                </span>
                <span aria-hidden="true" className="text-muted-foreground text-[15px]">
                  →
                </span>
                <span aria-hidden="true" className="stat-number text-[52px] leading-none">
                  {rating}
                </span>
                <span className={cn("stat-number text-[15px]", delta >= 0 ? "text-win" : "text-loss")}>
                  {signedChange(delta)}
                </span>
              </p>

              <div className="mt-7 flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className={p.xpCapped ? "text-muted-foreground" : "font-semibold"}>{xp.label}</span>
                  <span className="text-muted-foreground stat-number">
                    Level {p.level} · {bar} / {p.needed}
                  </span>
                </div>
                <LevelBar
                  value={bar}
                  max={p.needed}
                  label={`Level ${p.level} progress`}
                  className="h-1.5 overflow-hidden rounded-full"
                />
              </div>

              {p.lines.length > 0 && (
                <ul className="bg-card mt-7 rounded-[18px] px-4 shadow-[inset_0_0_0_1px_var(--hairline)]">
                  {p.lines.map((line) => (
                    <li
                      key={line}
                      className="border-hairline-row flex items-center gap-3 border-b py-3 text-[14px] leading-snug last:border-b-0"
                    >
                      <LineMark line={line} />
                      <span className="min-w-0">{emphasise(line)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-auto flex gap-2 pt-10">
                <Button variant="ghost" size="xl" className="flex-1" onClick={done}>
                  Done
                </Button>
                {p.action.kind === "rematch" ? (
                  // Leaving Home closes the screen; it is remembered as seen.
                  <Button asChild size="xl" className="flex-1">
                    <Link href={p.action.href} onClick={remember}>
                      Rematch
                    </Link>
                  </Button>
                ) : (
                  // Back to the end of tonight's line; the redirect lands on
                  // Home again, so the screen closes on submit.
                  <form action={joinLine} onSubmit={done} className="flex flex-1">
                    <input type="hidden" name="night_id" value={p.action.nightId} />
                    <input type="hidden" name="back" value="/" />
                    <SubmitButton size="xl" className="w-full" pendingChildren="Joining…">
                      Back in line
                    </SubmitButton>
                  </form>
                )}
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// The rank and the record read in bold, as in the mockup: "#3", "9–3".
function emphasise(line: string) {
  return line.split(/(#\d+|\d+–\d+)/).map((part, i) =>
    i % 2 === 1 ? (
      <b key={i} className="font-semibold">
        {part}
      </b>
    ) : (
      part
    )
  );
}

const MARK = "flex size-7 shrink-0 items-center justify-center rounded-full";
const BRASS_WASH = "bg-brass/15 text-brass";

// A small mark per kind of line (decorative: the line says it all).
function LineMark({ line }: { line: string }) {
  if (/^Down to #/.test(line)) {
    return (
      <span aria-hidden="true" className={cn(MARK, "bg-loss/15 text-loss")}>
        <ArrowDown className="size-3.5" strokeWidth={2} />
      </span>
    );
  }
  const Icon = /^(Up to|On the board at) #/.test(line)
    ? ArrowUp
    : /^Level \d+$|badge unlocked$/.test(line)
      ? Sparkles
      : / unlocked$/.test(line)
        ? Medal
        : /^Your first win over /.test(line)
          ? Star
          : / in a row$/.test(line)
            ? null
            : CircleDot;
  return (
    <span aria-hidden="true" className={cn(MARK, BRASS_WASH)}>
      {Icon ? <Icon className="size-3.5" strokeWidth={2} /> : <FlameMark size={16} />}
    </span>
  );
}
