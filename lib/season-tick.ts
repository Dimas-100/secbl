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

// Uploads that never became a post (the browser uploads first, then records
// the row) would otherwise sit in the bucket for good. The list comes from a
// security-definer SQL function (PostgREST does not expose the storage
// schema); an error anywhere means nothing is removed.
export async function sweepOrphanPhotos(service: SupabaseClient): Promise<{ removed: number; error: string | null }> {
  try {
    const { data, error } = await service.rpc("orphan_post_photos");
    if (error) return { removed: 0, error: error.message };
    const orphans = ((data ?? []) as string[]).filter((n) => typeof n === "string" && n.length > 0);
    if (orphans.length === 0) return { removed: 0, error: null };
    const { error: rmErr } = await service.storage.from("posts").remove(orphans);
    if (rmErr) return { removed: 0, error: rmErr.message };
    return { removed: orphans.length, error: null };
  } catch (err) {
    return { removed: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
