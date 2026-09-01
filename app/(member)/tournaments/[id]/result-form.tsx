"use client";

import { useState } from "react";
import { ScoreStepper } from "@/components/score-stepper";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/utils";
import { recordResult } from "@/app/(member)/tournaments/actions";

// Tournament result entry on the same steppers as match reporting — one
// muscle memory at the table. The winner auto-follows the higher score but
// stays an explicit, tappable choice because the action demands winner_id
// (scores alone can't decide a walkover correction).
export function ResultForm({
  tournamentId,
  matchId,
  player1,
  player2,
}: {
  tournamentId: string;
  matchId: string;
  player1: { id: string; label: string };
  player2: { id: string; label: string };
}) {
  const [s1, setS1] = useState(0);
  const [s2, setS2] = useState(0);
  const [override, setOverride] = useState<string | null>(null);

  const auto = s1 > s2 ? player1.id : s2 > s1 ? player2.id : null;
  const winnerId = override ?? auto;

  return (
    <form action={recordResult} data-result-entry className="flex flex-col gap-3">
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="tournament_match_id" value={matchId} />
      <input type="hidden" name="player1_score" value={s1} />
      <input type="hidden" name="player2_score" value={s2} />
      {winnerId && <input type="hidden" name="winner_id" value={winnerId} />}

      <div className="flex gap-3">
        <ScoreStepper label={player1.label} accent value={s1} onChange={setS1} />
        <ScoreStepper label={player2.label} value={s2} onChange={setS2} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[player1, player2].map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={winnerId === p.id}
            onClick={() => setOverride(p.id)}
            className={cn(
              "h-10 truncate rounded-lg px-2 text-xs font-bold",
              winnerId === p.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {p.label} won
          </button>
        ))}
      </div>

      <SubmitButton disabled={!winnerId} pendingChildren="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}
