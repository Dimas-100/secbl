"use client";

import { useEffect, useRef, useState } from "react";
import { ScoreStepper } from "@/components/score-stepper";
import { SubmitButton } from "@/components/submit-button";
import { canDecrement, canIncrement, finished, raceProgress, type RaceState } from "@/lib/race";
import { cn } from "@/lib/utils";
import { correctScores, recordResult } from "@/app/(member)/tournaments/actions";

export interface SheetPlayer {
  id: string;
  name: string;
  seed: number | null;
}

// One match, full screen: the same hero numbers and + / − as Log a game,
// rails toward the cup's race length, what each side still needs, and a Save
// that wakes up when someone reaches the race. In "fix" mode it edits a
// recorded result instead (same board, different action, winner unchanged).
export function ScoreSheet({
  tournamentId,
  matchId,
  raceTo,
  player1,
  player2,
  initial,
  mode,
}: {
  tournamentId: string;
  matchId: string;
  raceTo: number;
  player1: SheetPlayer;
  player2: SheetPlayer;
  initial: { p1: number; p2: number };
  mode: "record" | "fix";
}) {
  const [p1, setP1] = useState(initial.p1);
  const [p2, setP2] = useState(initial.p2);
  const race: RaceState = { you: p1, them: p2, raceTo, spot: 0, spotTo: null };
  const done = finished(race);
  const winnerId = done === "you" ? player1.id : done === "them" ? player2.id : null;
  const leader = p1 > p2 ? "you" : p2 > p1 ? "them" : null;
  const first = (n: string) => n.split(" ")[0];
  const buzzed = useRef<string | null>(null);

  useEffect(() => {
    if (!done) {
      buzzed.current = null;
      return;
    }
    if (buzzed.current === done) return;
    buzzed.current = done;
    if (typeof window === "undefined" || !("vibrate" in navigator)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate?.([30, 40, 30]);
  }, [done]);

  const line = done
    ? `${first(done === "you" ? player1.name : player2.name)} wins ${Math.max(p1, p2)}–${Math.min(p1, p2)}`
    : `${first(player1.name)} needs ${raceTo - p1} · ${first(player2.name)} needs ${raceTo - p2}`;

  return (
    <form action={mode === "record" ? recordResult : correctScores} data-result-entry className="flex flex-col gap-7">
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="tournament_match_id" value={matchId} />
      <input type="hidden" name="player1_score" value={p1} />
      <input type="hidden" name="player2_score" value={p2} />
      {winnerId && <input type="hidden" name="winner_id" value={winnerId} />}

      <div className="grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-start pt-2">
        <ScoreStepper
          label={player1.seed ? `${player1.name} · ${player1.seed}` : player1.name}
          value={p1}
          onChange={setP1}
          canIncrement={canIncrement(race, "you")}
          canDecrement={canDecrement(race, "you")}
          progress={raceProgress(p1, raceTo)}
          tone={leader === "you" ? "lead" : null}
          effect={done === "you" ? "win" : done === "them" ? "loss" : null}
        />
        <span aria-hidden="true" className="bg-hairline-divider h-[150px] w-px self-center" />
        <ScoreStepper
          label={player2.seed ? `${player2.name} · ${player2.seed}` : player2.name}
          value={p2}
          onChange={setP2}
          canIncrement={canIncrement(race, "them")}
          canDecrement={canDecrement(race, "them")}
          progress={raceProgress(p2, raceTo)}
          tone={leader === "them" ? "lead" : null}
          effect={done === "them" ? "win" : done === "you" ? "loss" : null}
        />
      </div>

      <p aria-live="polite" className={cn("stat-number text-center text-[13px]", done ? "text-win" : "text-muted-foreground")}>
        {line}
      </p>

      <div className="flex flex-col gap-2.5">
        <SubmitButton size="xl" className="w-full" disabled={!done} pendingChildren={mode === "record" ? "Saving…" : "Fixing…"}>
          {mode === "record" ? "Save result" : "Fix score"}
        </SubmitButton>
        <p className="text-muted-foreground text-center text-[12px]">
          {done
            ? mode === "record"
              ? "The winner advances and both ratings update."
              : "Ratings don't change — only who won counts for those."
            : `Enabled when someone reaches ${raceTo}.`}
        </p>
      </div>
    </form>
  );
}
