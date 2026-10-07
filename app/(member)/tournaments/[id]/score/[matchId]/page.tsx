import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { voidResult } from "@/app/(member)/tournaments/actions";
import { ScoreSheet } from "./score-sheet";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The score sheet for one cup match. Admin only: records a result while the
// match is open, or fixes the score / voids the result once it is decided.
export default async function ScoreMatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; matchId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id, matchId } = await params;
  const { error } = await searchParams;
  if (!UUID.test(id) || !UUID.test(matchId)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") redirect(`/tournaments/${id}`);

  const [{ data: tournament }, { data: match }, { data: entrants }, { data: lastRound }] = await Promise.all([
    supabase.from("tournaments").select("id, name, status, race_to").eq("id", id).single(),
    supabase
      .from("tournament_matches")
      .select("id, round, position, player1_id, player2_id, player1_score, player2_score, winner_id, winner_advances_to")
      .eq("id", matchId)
      .eq("tournament_id", id)
      .single(),
    supabase.from("tournament_players").select("profile_id, seed, profiles(display_name)").eq("tournament_id", id),
    supabase.from("tournament_matches").select("round").eq("tournament_id", id).order("round", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!tournament || !match) notFound();
  if (!match.player1_id || !match.player2_id) redirect(`/tournaments/${id}`);

  const who = new Map<string, { name: string; seed: number | null }>();
  for (const e of entrants ?? []) {
    const p = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles;
    who.set(e.profile_id as string, { name: p?.display_name ?? "Unknown", seed: (e.seed as number) ?? null });
  }
  const p1 = { id: match.player1_id, ...(who.get(match.player1_id) ?? { name: "Unknown", seed: null }) };
  const p2 = { id: match.player2_id, ...(who.get(match.player2_id) ?? { name: "Unknown", seed: null }) };
  const decided = match.winner_id !== null;
  // Final, Semifinal 1, Quarterfinal 3, Match 2 — the same names as the bracket.
  const rounds = lastRound?.round ?? match.round;
  const fromEnd = rounds - match.round;
  const roundName =
    fromEnd === 0
      ? "Final"
      : fromEnd === 1
        ? `Semifinal ${match.position + 1}`
        : fromEnd === 2
          ? `Quarterfinal ${match.position + 1}`
          : `Round ${match.round} · Match ${match.position + 1}`;

  if (!decided && tournament.status !== "live") redirect(`/tournaments/${id}`);

  return (
    <main className="flex flex-col gap-7">
      <PageHeader
        title={roundName}
        back={`/tournaments/${id}`}
        backIcon="close"
        backLabel="Back to bracket"
        trailing={<Badge variant="secondary">Race to {tournament.race_to}</Badge>}
      />
      {error && <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>}
      {decided && (
        <p className="text-muted-foreground text-center text-[13px]">
          This result is recorded. Change the score below, or void it to replay the match.
        </p>
      )}
      <ScoreSheet
        tournamentId={id}
        matchId={matchId}
        raceTo={tournament.race_to}
        player1={p1}
        player2={p2}
        initial={{ p1: match.player1_score ?? 0, p2: match.player2_score ?? 0 }}
        mode={decided ? "fix" : "record"}
      />
      {decided && (
        <form action={voidResult} className="flex flex-col items-center gap-1.5 pt-2">
          <input type="hidden" name="tournament_id" value={id} />
          <input type="hidden" name="tournament_match_id" value={matchId} />
          <SubmitButton variant="ghost" className="text-destructive" pendingChildren="Voiding…">
            Void this result
          </SubmitButton>
          <p className="text-muted-foreground text-center text-[12px]">
            Undoes the result and the rating moves. Not possible once the winner has played on.
          </p>
        </form>
      )}
    </main>
  );
}
