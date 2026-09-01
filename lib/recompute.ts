import type { SupabaseClient } from "@supabase/supabase-js";
import {
  replayRatings,
  type ReplayMatch,
  type ReplayDelta,
  type ReplayHistoryRow,
  type ReplayStanding,
} from "@/lib/rating";

export interface RecomputePayload {
  p_standings: ReplayStanding[];
  p_history: ReplayHistoryRow[];
  p_deltas: ReplayDelta[];
}

// Builds the arguments for apply_rating_recompute by replaying every confirmed
// match. `extra` lets a caller include a result it is about to write in the
// same transaction; `excludeMatchId` lets a caller drop one it is voiding — so
// the ladder is never briefly wrong between two statements.
export async function buildRecomputePayload(
  service: SupabaseClient,
  extra: ReplayMatch[] = [],
  excludeMatchId?: string
): Promise<RecomputePayload> {
  const { data: rows, error } = await service
    .from("matches")
    .select("id, reporter_id, opponent_id, winner_id")
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);

  const { data: profiles, error: profilesError } = await service
    .from("profiles")
    .select("id");
  if (profilesError) throw new Error(profilesError.message);

  const history = ((rows ?? []) as ReplayMatch[])
    .filter((m) => m.id !== excludeMatchId)
    .concat(extra);

  const { standings, history: rows2, deltas } = replayRatings(
    history,
    (profiles ?? []).map((p) => p.id as string)
  );
  return { p_standings: standings, p_history: rows2, p_deltas: deltas };
}
