import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { bracketRounds, type GeneratedMatch } from "@/lib/bracket";
import { createClient } from "@/lib/supabase/server";
import { correctScores, recordResult, voidResult } from "@/app/(member)/tournaments/actions";
import { LiveRefresh } from "./refresh";

interface MatchRow extends GeneratedMatch {
  player1_score: number | null;
  player2_score: number | null;
}

export default async function TournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const { error, message } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, status")
    .eq("id", id)
    .single();
  if (!tournament) notFound();
  if (tournament.status === "setup") redirect(`/tournaments/${id}/setup`);

  const { data: rows } = await supabase
    .from("tournament_matches")
    .select(
      "id, round, position, player1_id, player2_id, player1_score, player2_score, winner_id, winner_advances_to, winner_advances_slot"
    )
    .eq("tournament_id", id);

  const { data: entrants } = await supabase
    .from("tournament_players")
    .select("profile_id, seed, profiles(display_name)")
    .eq("tournament_id", id)
    .order("seed");

  const nameOf = new Map<string, string>();
  const seedOf = new Map<string, number>();
  for (const e of entrants ?? []) {
    const profile = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles;
    nameOf.set(e.profile_id as string, profile?.display_name ?? "Unknown");
    seedOf.set(e.profile_id as string, e.seed as number);
  }
  const label = (playerId: string | null) =>
    playerId ? `${nameOf.get(playerId) ?? "Unknown"} (${seedOf.get(playerId)})` : "TBD";

  const matches = (rows ?? []) as MatchRow[];
  const rounds = bracketRounds(matches);
  const final = matches.find((m) => m.winner_advances_to === null);
  const isAdmin = me?.role === "admin";

  return (
    <main className="flex flex-col gap-6">
      {tournament.status === "live" && <LiveRefresh />}
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">{tournament.name}</h1>
        <Badge variant={tournament.status === "live" ? "default" : "secondary"}>
          {tournament.status === "live" ? "Live" : "Complete"}
        </Badge>
      </div>
      {message && <p className="rounded-md bg-muted p-3 text-sm">{message}</p>}
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      {tournament.status === "complete" && final?.winner_id && (
        <Card>
          <CardHeader>
            <CardTitle>Champion</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{label(final.winner_id)}</CardContent>
        </Card>
      )}

      {rounds.map((round, index) => (
        <Card key={index}>
          <CardHeader>
            <CardTitle>
              {index === rounds.length - 1 ? "Final" : `Round ${index + 1}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {round.map((m) => {
              const match = m as MatchRow;
              const decided = match.winner_id !== null;
              const bye = match.player1_id !== null && match.player2_id === null && decided;
              const ready = match.player1_id !== null && match.player2_id !== null;
              return (
                <div key={match.id} className="flex flex-col gap-2 border-b pb-3 last:border-b-0">
                  <div className="text-sm">
                    <span className={match.winner_id === match.player1_id ? "font-bold" : ""}>
                      {label(match.player1_id)}
                    </span>
                    {" vs "}
                    <span className={match.winner_id === match.player2_id ? "font-bold" : ""}>
                      {bye ? "bye" : label(match.player2_id)}
                    </span>
                    {decided && !bye && (
                      <span className="text-muted-foreground">
                        {" "}
                        — {match.player1_score}–{match.player2_score}
                      </span>
                    )}
                  </div>

                  {isAdmin && ready && !decided && tournament.status === "live" && (
                    <form action={recordResult} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="tournament_id" value={id} />
                      <input type="hidden" name="tournament_match_id" value={match.id} />
                      <Input
                        name="player1_score"
                        type="number"
                        min={0}
                        required
                        className="w-16"
                        aria-label={`${label(match.player1_id)} score`}
                      />
                      <Input
                        name="player2_score"
                        type="number"
                        min={0}
                        required
                        className="w-16"
                        aria-label={`${label(match.player2_id)} score`}
                      />
                      <select
                        name="winner_id"
                        required
                        defaultValue=""
                        className="border-input h-9 rounded-md border bg-transparent px-2 text-sm"
                        aria-label="Winner"
                      >
                        <option value="" disabled>
                          Winner
                        </option>
                        <option value={match.player1_id!}>{label(match.player1_id)}</option>
                        <option value={match.player2_id!}>{label(match.player2_id)}</option>
                      </select>
                      <Button size="sm" type="submit">
                        Save
                      </Button>
                    </form>
                  )}

                  {isAdmin && decided && !bye && (
                    <div className="flex flex-wrap items-end gap-2">
                      {/* Fixing a score never touches the ladder, so it stays
                          available even after the winner has played on. */}
                      <form action={correctScores} className="flex items-end gap-2">
                        <input type="hidden" name="tournament_id" value={id} />
                        <input type="hidden" name="tournament_match_id" value={match.id} />
                        <Input
                          name="player1_score"
                          type="number"
                          min={0}
                          required
                          defaultValue={match.player1_score ?? 0}
                          className="w-16"
                          aria-label="Corrected first score"
                        />
                        <Input
                          name="player2_score"
                          type="number"
                          min={0}
                          required
                          defaultValue={match.player2_score ?? 0}
                          className="w-16"
                          aria-label="Corrected second score"
                        />
                        <Button size="sm" variant="outline" type="submit">
                          Fix score
                        </Button>
                      </form>
                      <form action={voidResult}>
                        <input type="hidden" name="tournament_id" value={id} />
                        <input type="hidden" name="tournament_match_id" value={match.id} />
                        <Button size="sm" variant="outline" type="submit">
                          Void result
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
