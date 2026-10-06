"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Shuffle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionLabel } from "@/components/section-label";
import { SubmitButton } from "@/components/submit-button";
import { MAX_PLAYERS, MIN_PLAYERS } from "@/lib/bracket";
import { byRating, moveSeed, shuffleSeeds } from "@/lib/seeding";
import { saveEntrants, startTournament } from "@/app/(member)/tournaments/actions";

export interface Candidate {
  id: string;
  display_name: string;
  rating: number;
  school: string | null;
}

// Who is in, and in what order. The seed list IS the bracket: seed 1 is the
// favourite, byes go to the top seeds, 1 and 2 can only meet in the final.
// Admins set the order by hand (everyone starts at the same rating, so
// judgement matters), sort it by rating, or draw it at random. Both Save and
// Start submit the list as shown, so what you see is what gets bracketed.
export function EntrantsEditor({
  tournamentId,
  candidates,
  initialSeeds,
}: {
  tournamentId: string;
  candidates: Candidate[];
  initialSeeds: string[];
}) {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const [seeds, setSeeds] = useState<string[]>(initialSeeds.filter((id) => byId.has(id)));
  const [drawn, setDrawn] = useState(false);
  const chosen = new Set(seeds);

  function toggle(id: string) {
    setDrawn(false);
    setSeeds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  const ratingOf = (id: string) => byId.get(id)?.rating ?? 0;
  const nameOf = (id: string) => byId.get(id)?.display_name ?? "";

  return (
    <form className="flex flex-col gap-6">
      <input type="hidden" name="tournament_id" value={tournamentId} />
      {seeds.map((id) => (
        <input key={id} type="hidden" name="profile_ids" value={id} />
      ))}

      <Card>
        <CardHeader>
          <SectionLabel>Seeds</SectionLabel>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {seeds.length === 0 ? (
            <p className="text-muted-foreground text-sm">Tick players below to add them. The order you set here is the bracket.</p>
          ) : (
            <ol className="flex flex-col">
              {seeds.map((id, i) => {
                const c = byId.get(id)!;
                return (
                  <li key={id} className="border-hairline-row flex items-center gap-3 border-b py-2.5 last:border-b-0">
                    <span className="stat-number text-muted-foreground w-6 text-[13px]">{i + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-medium">{c.display_name}</span>
                      <span className="text-muted-foreground text-[12px]">
                        {c.school ? `${c.school} · ` : ""}
                        {c.rating}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Move ${c.display_name} up`}
                      disabled={i === 0}
                      onClick={() => {
                        setDrawn(false);
                        setSeeds((cur) => moveSeed(cur, i, -1));
                      }}
                      className="press flex size-10 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--hairline-ghost)] disabled:opacity-30"
                    >
                      <ArrowUp className="size-4" strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${c.display_name} down`}
                      disabled={i === seeds.length - 1}
                      onClick={() => {
                        setDrawn(false);
                        setSeeds((cur) => moveSeed(cur, i, 1));
                      }}
                      className="press flex size-10 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--hairline-ghost)] disabled:opacity-30"
                    >
                      <ArrowDown className="size-4" strokeWidth={1.8} />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={seeds.length < 2}
              onClick={() => {
                setDrawn(false);
                setSeeds((cur) => byRating(cur, ratingOf, nameOf));
              }}
            >
              <Sparkles className="size-4" />
              Seed by rating
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={seeds.length < 2}
              onClick={() => {
                setSeeds((cur) => shuffleSeeds(cur, Math.random));
                setDrawn(true);
              }}
            >
              <Shuffle className="size-4" />
              Random draw
            </Button>
          </div>
          <p aria-live="polite" className="text-muted-foreground text-[12px]">
            {drawn
              ? "Drawn at random. Draw again if you like, or move anyone by hand."
              : "Seed 1 is the favourite. Byes go to the top seeds; seeds 1 and 2 can only meet in the final."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionLabel>Players</SectionLabel>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <p className="text-muted-foreground pb-1 text-xs">
            Tick to add to the bottom of the seeds. {MIN_PLAYERS} to {MAX_PLAYERS} players.
          </p>
          {candidates.map((c) => (
            <label key={c.id} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                value={c.id}
                checked={chosen.has(c.id)}
                onChange={() => toggle(c.id)}
                aria-label={c.display_name}
                className="accent-primary size-5"
              />
              <span className="font-medium">{c.display_name}</span>
              {c.school && <Badge variant="secondary">{c.school}</Badge>}
              <span className="text-muted-foreground">{c.rating}</span>
            </label>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <SubmitButton formAction={saveEntrants} size="lg" variant="outline" className="w-full" pendingChildren="Saving…">
          Save entrants
        </SubmitButton>
        <SubmitButton
          formAction={startTournament}
          size="xl"
          className="w-full"
          disabled={seeds.length < MIN_PLAYERS || seeds.length > MAX_PLAYERS}
          pendingChildren="Starting…"
        >
          Start tournament ({seeds.length} {seeds.length === 1 ? "entrant" : "entrants"})
        </SubmitButton>
        <p className="text-muted-foreground text-xs">
          Starting saves this order, generates the whole bracket and locks the entrant list.
        </p>
      </div>
    </form>
  );
}
