// The daily season tick (spec §1): one "one week left" moment per season,
// posted to the feed and pushed to everyone, the morning the planned end is
// exactly WEEK_LEFT_DAYS away. The rule is pure; the runner is server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { seasonWeekLeftPayload } from "@/lib/push";
import { notifyAllMembers } from "@/lib/push-send";
import { daysLeft, seasonChampion } from "@/lib/season";
import { loadOpenSeason, loadSeasonStandings } from "@/lib/season-data";

export const WEEK_LEFT_DAYS = 7;

export function weekLeftDue(
  season: { ends_on: string | null; status: string },
  today: string,
  alreadyPosted: boolean
): boolean {
  if (season.status !== "open" || !season.ends_on || alreadyPosted) return false;
  return daysLeft({ starts_on: today, ends_on: season.ends_on }, today) === WEEK_LEFT_DAYS;
}

// Idempotent: the activity row is the record that the reminder went out.
// Never throws — the health check that calls it must still answer.
export async function runSeasonTick(service: SupabaseClient, today: string): Promise<void> {
  try {
    const season = await loadOpenSeason(service);
    if (!season) return;
    const { count } = await service
      .from("activity")
      .select("id", { count: "exact", head: true })
      .eq("season_id", season.id)
      .eq("kind", "season_week_left");
    if (!weekLeftDue(season, today, (count ?? 0) > 0)) return;
    const standings = await loadSeasonStandings(service, season);
    const leader = seasonChampion(standings);
    const { error } = await service.from("activity").insert({
      kind: "season_week_left",
      season_id: season.id,
      data: {
        name: season.name,
        leader_id: leader?.id ?? null,
        leader_name: leader?.display_name ?? null,
        leader_points: leader?.points ?? 0,
      },
    });
    if (error) {
      console.warn("season tick: insert failed", error.message);
      return;
    }
    await notifyAllMembers(service, {
      category: "league",
      excludeId: null,
      payload: seasonWeekLeftPayload({
        seasonId: season.id,
        name: season.name,
        leaderName: leader?.display_name ?? null,
        leaderPoints: leader?.points ?? 0,
      }),
    });
  } catch (err) {
    console.warn("season tick failed", err);
  }
}
