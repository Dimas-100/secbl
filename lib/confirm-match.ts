import type { SupabaseClient } from "@supabase/supabase-js";
import { ratingUpdate } from "@/lib/rating";
import type { Match } from "@/lib/types";

// Computes both players' deltas with the TS rating engine, then applies them
// atomically via the service-role-only apply_match_confirmation function.
// `agreed` is a game the scorekeeper counted on the spot: the same
// confirmation, plus the agreed_at stamp that opens the opponent's 24 hours
// to flag it (spec 2026-10-20-agreed-results).
export async function confirmPendingMatch(
  service: SupabaseClient,
  match: Match,
  opts: { agreed?: boolean } = {}
): Promise<void> {
  const { data: players, error: playersError } = await service
    .from("profiles")
    .select("id, rating, matches_played")
    .in("id", [match.reporter_id, match.opponent_id]);
  if (playersError || !players || players.length !== 2) {
    throw new Error(playersError?.message ?? "match players not found");
  }
  const reporter = players.find((p) => p.id === match.reporter_id)!;
  const opponent = players.find((p) => p.id === match.opponent_id)!;
  const reporterWon = match.winner_id === match.reporter_id;

  const reporterResult = ratingUpdate(
    reporter.rating,
    opponent.rating,
    reporterWon,
    reporter.matches_played
  );
  const opponentResult = ratingUpdate(
    opponent.rating,
    reporter.rating,
    !reporterWon,
    opponent.matches_played
  );

  const { error } = await service.rpc(opts.agreed ? "apply_agreed_confirmation" : "apply_match_confirmation", {
    p_match_id: match.id,
    p_reporter_delta: reporterResult.delta,
    p_opponent_delta: opponentResult.delta,
  });
  if (error) throw new Error(error.message);
}
