import type { SupabaseClient } from "@supabase/supabase-js";
import { clubWeekOf } from "@/lib/events";
import { fetchAllPages } from "@/lib/paging";
import { levelFromXp, xpFromMatches, type LevelInfo, type XpMatch, type XpResult } from "@/lib/levels";

interface MatchScanRow {
  id: string;
  reporter_id: string;
  opponent_id: string;
  winner_id: string;
  status: string;
  confirmed_at: string | null;
  tournament_match_id: string | null;
}

// A member's confirmed matches in XP order, finals marked. The input to
// every level computation, so a "level before this match" can be replayed
// from the same list (lib/activity-write.ts).
export async function loadXpMatches(supabase: SupabaseClient, memberId: string): Promise<XpMatch[]> {
  const [rows, { data: finals }] = await Promise.all([
    // PostgREST caps every response at db-max-rows (1000) whatever range is
    // asked for, so the scan pages (lib/paging.ts).
    fetchAllPages<MatchScanRow>((from, to) =>
      supabase
        .from("matches")
        .select("id, reporter_id, opponent_id, winner_id, status, confirmed_at, tournament_match_id")
        .eq("status", "confirmed")
        .or(`reporter_id.eq.${memberId},opponent_id.eq.${memberId}`)
        .order("confirmed_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .then(({ data }) => (data ?? []) as MatchScanRow[])
    ),
    // Finals: the match whose winner advances nowhere, in a finished cup.
    supabase
      .from("tournament_matches")
      .select("id, tournaments!inner(status)")
      .eq("winner_id", memberId)
      .is("winner_advances_to", null)
      .eq("tournaments.status", "complete"),
  ]);
  const finalIds = new Set((finals ?? []).map((f) => f.id as string));
  const matches: XpMatch[] = rows.map((r) => ({
    id: r.id,
    reporter_id: r.reporter_id,
    opponent_id: r.opponent_id,
    winner_id: r.winner_id,
    status: r.status,
    confirmed_at: r.confirmed_at,
    is_final: r.tournament_match_id ? finalIds.has(r.tournament_match_id) : false,
  }));
  return matches;
}

// One loader for every surface that shows a level, so Home, Profile and the
// ladder can never disagree. Reads only; nothing is stored.
export async function loadXp(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ xp: XpResult; level: LevelInfo }> {
  const matches = await loadXpMatches(supabase, memberId);
  const xp = xpFromMatches(memberId, matches, clubWeekOf);
  return { xp, level: levelFromXp(xp.total) };
}

// Every member's level in one scan, for surfaces that show many players at
// once (the leaderboard). Same inputs as loadXp, grouped per player, so the
// badge beside a name can never disagree with that player's profile.
export async function loadAllLevels(supabase: SupabaseClient): Promise<Map<string, LevelInfo>> {
  const [rows, { data: finals }] = await Promise.all([
    fetchAllPages<MatchScanRow>((from, to) =>
      supabase
        .from("matches")
        .select("id, reporter_id, opponent_id, winner_id, status, confirmed_at, tournament_match_id")
        .eq("status", "confirmed")
        .order("confirmed_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .then(({ data }) => (data ?? []) as MatchScanRow[])
    ),
    supabase
      .from("tournament_matches")
      .select("id, winner_id, tournaments!inner(status)")
      .is("winner_advances_to", null)
      .not("winner_id", "is", null)
      .eq("tournaments.status", "complete"),
  ]);
  const finalIds = new Set((finals ?? []).map((f) => f.id as string));
  const byPlayer = new Map<string, XpMatch[]>();
  for (const r of rows) {
    const m: XpMatch = {
      id: r.id,
      reporter_id: r.reporter_id,
      opponent_id: r.opponent_id,
      winner_id: r.winner_id,
      status: r.status,
      confirmed_at: r.confirmed_at,
      is_final: r.tournament_match_id ? finalIds.has(r.tournament_match_id) : false,
    };
    for (const id of [r.reporter_id as string, r.opponent_id as string]) {
      const list = byPlayer.get(id);
      if (list) list.push(m);
      else byPlayer.set(id, [m]);
    }
  }
  const levels = new Map<string, LevelInfo>();
  for (const [id, list] of byPlayer) {
    levels.set(id, levelFromXp(xpFromMatches(id, list, clubWeekOf).total));
  }
  return levels;
}

// A player with no confirmed matches is a level-1 Rookie.
export function levelOf(levels: Map<string, LevelInfo>, id: string): LevelInfo {
  return levels.get(id) ?? levelFromXp(0);
}
