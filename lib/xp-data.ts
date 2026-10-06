import type { SupabaseClient } from "@supabase/supabase-js";
import { clubWeekOf } from "@/lib/events";
import { levelFromXp, xpFromMatches, type LevelInfo, type XpMatch, type XpResult } from "@/lib/levels";

// One loader for every surface that shows a level, so Home, Profile and the
// ladder can never disagree. Reads only; nothing is stored.
export async function loadXp(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ xp: XpResult; level: LevelInfo }> {
  const [{ data: rows }, { data: finals }] = await Promise.all([
    supabase
      .from("matches")
      .select("id, reporter_id, opponent_id, winner_id, status, confirmed_at, tournament_match_id")
      .eq("status", "confirmed")
      .or(`reporter_id.eq.${memberId},opponent_id.eq.${memberId}`)
      .order("confirmed_at", { ascending: true })
      // PostgREST's default max rows (1000) would silently truncate a long
      // career; a member cannot plausibly pass this bound.
      .range(0, 4999),
    // Finals: the match whose winner advances nowhere, in a finished cup.
    supabase
      .from("tournament_matches")
      .select("id, tournaments!inner(status)")
      .eq("winner_id", memberId)
      .is("winner_advances_to", null)
      .eq("tournaments.status", "complete"),
  ]);
  const finalIds = new Set((finals ?? []).map((f) => f.id as string));
  const matches: XpMatch[] = (rows ?? []).map((r) => ({
    id: r.id,
    reporter_id: r.reporter_id,
    opponent_id: r.opponent_id,
    winner_id: r.winner_id,
    status: r.status,
    confirmed_at: r.confirmed_at,
    is_final: r.tournament_match_id ? finalIds.has(r.tournament_match_id) : false,
  }));
  const xp = xpFromMatches(memberId, matches, clubWeekOf);
  return { xp, level: levelFromXp(xp.total) };
}
