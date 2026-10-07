"use server";

import { validateLive, type LiveInput } from "@/lib/live";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// The scoreboard publishes itself (spec §3): one row per reporter, upserted
// on every change once an opponent is picked, so Home can show the table.
// Never throws — a board that cannot be seen is still a board that works.
export async function publishLiveGame(input: LiveInput): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Please log in again." };
    const problem = validateLive(input, user.id);
    if (problem) return { error: problem };
    const service = createServiceClient();
    const { data: opponent } = await service
      .from("profiles")
      .select("id")
      .eq("id", input.opponentId)
      .eq("status", "approved")
      .maybeSingle();
    if (!opponent) return { error: "Opponent not found" };
    const { error } = await service.from("live_games").upsert(
      {
        reporter_id: user.id,
        opponent_id: input.opponentId,
        game_type: input.gameType,
        race_to: input.raceTo,
        spot: input.spot,
        spot_to: input.spotTo === "me" ? user.id : input.spotTo === "them" ? input.opponentId : null,
        reporter_score: input.you,
        opponent_score: input.them,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "reporter_id" }
    );
    return { error: error?.message ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not publish the game" };
  }
}

export async function clearLiveGame(): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await createServiceClient().from("live_games").delete().eq("reporter_id", user.id);
  } catch {
    // The row goes stale on its own after three hours.
  }
}
