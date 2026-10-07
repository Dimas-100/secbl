// Season loaders (spec §1). One place every surface reads a season from, so
// Home, the Season tab and Admin can never disagree about who leads.
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/paging";
import { seasonStandings, type SeasonMatch, type Standing } from "@/lib/season";
import type { Season } from "@/lib/types";

const COLS = "id, name, starts_on, ends_on, status, champion_id, created_by, created_at, closed_at";

export async function loadOpenSeason(supabase: SupabaseClient): Promise<Season | null> {
  const { data } = await supabase.from("seasons").select(COLS).eq("status", "open").maybeSingle();
  return (data as Season | null) ?? null;
}

export async function loadSeasonById(supabase: SupabaseClient, id: string): Promise<Season | null> {
  const { data } = await supabase.from("seasons").select(COLS).eq("id", id).maybeSingle();
  return (data as Season | null) ?? null;
}

// Newest first.
export async function loadSeasons(supabase: SupabaseClient): Promise<Season[]> {
  const { data } = await supabase.from("seasons").select(COLS).order("starts_on", { ascending: false });
  return (data ?? []) as Season[];
}

// Every approved member and every confirmed match played inside the season,
// paged (PostgREST caps a response at the project's max rows).
export async function loadSeasonStandings(supabase: SupabaseClient, season: Season): Promise<Standing[]> {
  const matchesPage = (from: number, to: number) => {
    let q = supabase
      .from("matches")
      .select("id, reporter_id, opponent_id, winner_id, played_at")
      .eq("status", "confirmed")
      .gte("played_at", season.starts_on);
    if (season.ends_on) q = q.lte("played_at", season.ends_on);
    return q
      .order("played_at")
      .order("id")
      .range(from, to)
      .then(({ data }) => (data ?? []) as SeasonMatch[]);
  };
  const [matches, members] = await Promise.all([
    fetchAllPages<SeasonMatch>(matchesPage),
    fetchAllPages<{ id: string; display_name: string }>((from, to) =>
      supabase
        .from("profiles")
        .select("id, display_name")
        .eq("status", "approved")
        .order("id")
        .range(from, to)
        .then(({ data }) => (data ?? []) as { id: string; display_name: string }[])
    ),
  ]);
  return seasonStandings(matches, members, season);
}
