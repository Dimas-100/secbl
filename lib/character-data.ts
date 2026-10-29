import type { SupabaseClient } from "@supabase/supabase-js";
import { earnedAchievements } from "@/lib/achievements";
import type { Progress } from "@/lib/character";
import { fetchAllPages } from "@/lib/paging";
import { byPlayOrder, longestWinStreak, peakRating, type HistoryPoint, type StatMatch } from "@/lib/stats";
import { loadXp } from "@/lib/xp-data";

type Rated = { id: string; rating: number } | { id: string; rating: number }[] | null;
type ProgressMatch = StatMatch & { played_at: string; created_at: string; reporter: Rated; opponent: Rated };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

// Every saved look in the club, by member id, for the avatars
// (components/character-face.tsx LooksProvider). Members who never saved
// aren't in it and draw their starter. Small: one row per member who built a
// character, a few hundred bytes each. A failed read (or the column not there
// yet) leaves everyone on their starter rather than breaking the page.
export async function loadLooks(supabase: SupabaseClient): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from("profiles").select("id, look").not("look", "is", null);
  if (error) return {};
  return Object.fromEntries((data ?? []).map((r) => [r.id as string, r.look as unknown]));
}

// What a member has done that earns character parts, read from what the app
// already records: the same counts, games and rating line the profile reads,
// and its achievements worked out by the same function (lib/achievements.ts).
// Reads only.
export async function loadCharacterProgress(supabase: SupabaseClient, memberId: string): Promise<Progress> {
  const [{ level }, { data: me }, { count: cupsWon }, { count: seasonsWon }, matches, history, { count: nightsOpened }] =
    await Promise.all([
      loadXp(supabase, memberId),
      supabase.from("profiles").select("rating").eq("id", memberId).single(),
      supabase
        .from("tournament_matches")
        .select("id, tournaments!inner(status)", { count: "exact", head: true })
        .eq("winner_id", memberId)
        .is("winner_advances_to", null)
        .eq("tournaments.status", "complete"),
      supabase
        .from("seasons")
        .select("id", { count: "exact", head: true })
        .eq("status", "closed")
        .eq("champion_id", memberId),
      fetchAllPages<ProgressMatch>((from, to) =>
        supabase
          .from("matches")
          .select(
            "id, reporter_id, opponent_id, winner_id, reporter_score, opponent_score, confirmed_at, played_at, created_at, reporter:profiles!matches_reporter_id_fkey(id, rating), opponent:profiles!matches_opponent_id_fkey(id, rating)"
          )
          .eq("status", "confirmed")
          .or(`reporter_id.eq.${memberId},opponent_id.eq.${memberId}`)
          .order("confirmed_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
          .then(({ data }) => (data ?? []) as ProgressMatch[])
      ),
      fetchAllPages<HistoryPoint>((from, to) =>
        supabase
          .from("rating_history")
          .select("rating_before, rating_after, created_at")
          .eq("profile_id", memberId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
          .then(({ data }) => (data ?? []) as HistoryPoint[])
      ),
      supabase.from("club_nights").select("id", { count: "exact", head: true }).eq("opened_by", memberId),
    ]);

  const played = [...matches].sort(byPlayOrder);
  const rating = (me?.rating as number | undefined) ?? 0;
  // Opponents' current ratings, as the profile reads them for "giant killer".
  const opponentRatings: Record<string, number> = {};
  for (const m of matches) {
    for (const p of [one(m.reporter), one(m.opponent)]) if (p && p.id !== memberId) opponentRatings[p.id] = p.rating;
  }
  const achievements = earnedAchievements({
    viewerId: memberId,
    rating,
    peak: peakRating(history, rating).rating,
    matches: played,
    opponentRatings,
    tournamentsWon: cupsWon ?? 0,
    seasonsWon: seasonsWon ?? 0,
  }).map((a) => a.id);

  return {
    title: level.title,
    cupsWon: cupsWon ?? 0,
    seasonsWon: seasonsWon ?? 0,
    bestStreak: longestWinStreak(played, memberId),
    nightsOpened: nightsOpened ?? 0,
    achievements,
  };
}
