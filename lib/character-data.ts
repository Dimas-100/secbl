import type { SupabaseClient } from "@supabase/supabase-js";
import type { Progress } from "@/lib/character";
import { fetchAllPages } from "@/lib/paging";
import { byPlayOrder, longestWinStreak, type StatMatch } from "@/lib/stats";
import { loadXp } from "@/lib/xp-data";

type StreakMatch = StatMatch & { played_at: string; created_at: string };

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
// already records (the same counts the profile shows). Reads only.
export async function loadCharacterProgress(supabase: SupabaseClient, memberId: string): Promise<Progress> {
  const [{ level }, { count: cupsWon }, { count: seasonsWon }, matches, { count: nightsOpened }] = await Promise.all([
    loadXp(supabase, memberId),
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
    fetchAllPages<StreakMatch>((from, to) =>
      supabase
        .from("matches")
        .select("id, reporter_id, opponent_id, winner_id, reporter_score, opponent_score, confirmed_at, played_at, created_at")
        .eq("status", "confirmed")
        .or(`reporter_id.eq.${memberId},opponent_id.eq.${memberId}`)
        .order("confirmed_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .then(({ data }) => (data ?? []) as StreakMatch[])
    ),
    supabase.from("club_nights").select("id", { count: "exact", head: true }).eq("opened_by", memberId),
  ]);
  return {
    title: level.title,
    cupsWon: cupsWon ?? 0,
    seasonsWon: seasonsWon ?? 0,
    bestStreak: longestWinStreak([...matches].sort(byPlayOrder), memberId),
    nightsOpened: nightsOpened ?? 0,
  };
}
