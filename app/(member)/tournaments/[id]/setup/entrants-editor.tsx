"use client";

import { useState } from "react";
import { Shuffle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionLabel } from "@/components/section-label";
import { SubmitButton } from "@/components/submit-button";
import { MAX_PLAYERS, MIN_PLAYERS } from "@/lib/bracket";
import { byRating, shuffleSeeds, toggleSeed } from "@/lib/seeding";
import { cn } from "@/lib/utils";
import { saveEntrants, startTournament } from "@/app/(member)/tournaments/actions";

export interface Candidate {
  id: string;
  display_name: string;
  rating: number;
  school: string | null;
}

// Tap in order. The order you tap players is the seed order: first tap is
// seed 1, and a seeded player tapped again drops out while everyone below
// moves up. The seed list IS the bracket — seed 1 is the favourite, byes go
// to the top seeds, 1 and 2 can only meet in the final. "By rating" and
// "Random draw" rewrite the order when you would rather not rank people.
// Both Save and Start submit the list as shown.
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
  const [mode, setMode] = useState<"tap" | "drawn" | "rating">("tap");
  const seedOf = new Map(seeds.map((id, i) => [id, i + 1]));
  const ratingOf = (id: string) => byId.get(id)?.rating ?? 0;
  const nameOf = (id: string) => byId.get(id)?.display_name ?? "";
  const first = seeds[0] ? byId.get(seeds[0]) : null;

  const summary =
    seeds.length === 0
      ? "Tap players in order of strength — the first tap is seed 1."
      : mode === "drawn"
        ? `${seeds.length} entrants, drawn at random. ${first?.display_name} is seed 1. Draw again, or tap to adjust.`
        : mode === "rating"
          ? `${seeds.length} entrants, seeded by rating. ${first?.display_name} is seed 1.`
          : `${seeds.length} ${seeds.length === 1 ? "entrant" : "entrants"} · ${first?.display_name} is seed 1. Tap a seeded player to take them out.`;

  return (
    <form className="flex flex-col gap-6">
      <input type="hidden" name="tournament_id" value={tournamentId} />
      {seeds.map((id) => (
        <input key={id} type="hidden" name="profile_ids" value={id} />
      ))}

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <SectionLabel>Players</SectionLabel>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={seeds.length < 2}
                onClick={() => {
                  setSeeds((cur) => shuffleSeeds(cur, Math.random));
                  setMode("drawn");
                }}
              >
                <Shuffle className="size-4" />
                Random draw
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={seeds.length < 2}
                onClick={() => {
                  setSeeds((cur) => byRating(cur, ratingOf, nameOf));
                  setMode("rating");
                }}
              >
                <Sparkles className="size-4" />
                By rating
              </Button>
            </div>
          </div>
          <p aria-live="polite" className="text-muted-foreground text-[13px]">
            {summary}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col">
          {candidates.map((c) => {
            const seed = seedOf.get(c.id);
            return (
              <label
                key={c.id}
                className={cn(
                  "press border-hairline-row relative flex min-h-[56px] cursor-pointer items-center gap-3.5 border-b py-2 last:border-b-0",
                  seed === undefined && "text-muted-foreground"
                )}
              >
                <input
                  type="checkbox"
                  value={c.id}
                  checked={seed !== undefined}
                  onChange={() => {
                    setSeeds((cur) => toggleSeed(cur, c.id));
                    setMode("tap");
                  }}
                  aria-label={c.display_name}
                  // Invisible but full-size: the whole row is the tap target, and
                  // it stays a real, focusable checkbox for keyboards and tests.
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "stat-number flex size-8 shrink-0 items-center justify-center rounded-full text-[13px]",
                    seed !== undefined
                      ? "bg-brass text-background font-semibold"
                      : "shadow-[inset_0_0_0_1px_var(--hairline-ghost)]"
                  )}
                >
                  {seed ?? ""}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("truncate text-[15px]", seed !== undefined ? "text-foreground font-medium" : "font-normal")}>
                    {c.display_name}
                  </span>
                  <span className="text-muted-foreground text-[12px]">
                    {c.school ? `${c.school} · ` : ""}
                    {c.rating}
                  </span>
                </span>
              </label>
            );
          })}
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
          Seed 1 is the favourite; byes go to the top seeds; seeds 1 and 2 can only meet in the final. Starting
          saves this order, builds the whole bracket and locks the list. {MIN_PLAYERS} to {MAX_PLAYERS} players.
        </p>
      </div>
    </form>
  );
}
