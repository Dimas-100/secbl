"use server";

import { recentlySent, validateLive, type LiveInput } from "@/lib/live";
import { shouldResetLive } from "@/lib/table-talk";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// The scoreboard publishes itself (spec §3): one row per reporter, upserted
// on every change once an opponent is picked, so Home can show the table.
// Returns the game's id so the board can follow its table talk. Never throws
// — a board that cannot be seen is still a board that works.
export async function publishLiveGame(input: LiveInput): Promise<{ error: string | null; gameId: string | null }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Please log in again.", gameId: null };
    const problem = validateLive(input, user.id);
    if (problem) return { error: problem, gameId: null };
    // The write goes through the service role (live_games has no client
    // write policy), so membership is checked here: a suspended account must
    // not be able to put a table on everyone's Home.
    const service = createServiceClient();
    const { data: people } = await service
      .from("profiles")
      .select("id")
      .in("id", [user.id, input.opponentId])
      .eq("status", "approved");
    const approved = new Set((people ?? []).map((p) => p.id as string));
    if (!approved.has(user.id)) return { error: "Your account is not active.", gameId: null };
    if (!approved.has(input.opponentId)) return { error: "Opponent not found", gameId: null };
    // A publish still in flight when Send was tapped must not resurrect the
    // table after reportMatch deleted it: a report against this opponent in
    // the last minute means the game is over.
    const { data: sent } = await service
      .from("matches")
      .select("created_at")
      .eq("reporter_id", user.id)
      .eq("opponent_id", input.opponentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentlySent(sent?.created_at ?? null, new Date())) return { error: null, gameId: null };
    // A new opponent, or a board revived hours later, is a new game: its old
    // row goes first so the new one gets a fresh id and an empty thread.
    const { data: existing } = await service
      .from("live_games")
      .select("updated_at, opponent_id")
      .eq("reporter_id", user.id)
      .maybeSingle();
    if (shouldResetLive(existing, input.opponentId, new Date())) {
      await service.from("live_games").delete().eq("reporter_id", user.id);
    }
    const { data: row, error } = await service.from("live_games").upsert(
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
    )
      .select("id")
      .single();
    return { error: error?.message ?? null, gameId: (row?.id as string | undefined) ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not publish the game", gameId: null };
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
