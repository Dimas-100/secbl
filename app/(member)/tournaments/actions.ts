"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateSingleElim, MAX_PLAYERS, MIN_PLAYERS } from "@/lib/bracket";
import { clubDateOf } from "@/lib/events";
import { buildRecomputePayload } from "@/lib/recompute";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// The SQL functions re-check is_admin() themselves; this only turns a
// non-admin's attempt into a redirect instead of a raw database error.
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/tournaments");
  return { supabase, user };
}

export async function createTournament(formData: FormData) {
  const { supabase } = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect(`/tournaments/new?error=${encodeURIComponent("Give the tournament a name.")}`);
  }
  const eventId = String(formData.get("event_id") ?? "");
  const { data, error } = await supabase.rpc("create_tournament", {
    p_name: name,
    p_event_id: eventId || null,
  });
  if (error) {
    redirect(`/tournaments/new?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/tournaments");
  redirect(`/tournaments/${data}/setup`);
}

export async function saveEntrants(formData: FormData) {
  const { supabase } = await requireAdmin();
  const tournamentId = String(formData.get("tournament_id") ?? "");
  // Checkbox order in the DOM is seed order, highest rating first.
  const profileIds = formData.getAll("profile_ids").map(String).filter(Boolean);
  if (profileIds.length > MAX_PLAYERS) {
    redirect(
      `/tournaments/${tournamentId}/setup?error=${encodeURIComponent(
        `At most ${MAX_PLAYERS} entrants.`
      )}`
    );
  }
  const entrants = profileIds.map((profile_id, index) => ({
    profile_id,
    seed: index + 1,
  }));
  const { error } = await supabase.rpc("set_tournament_entrants", {
    p_tournament_id: tournamentId,
    p_entrants: entrants,
  });
  if (error) {
    redirect(`/tournaments/${tournamentId}/setup?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/tournaments/${tournamentId}/setup`);
  redirect(`/tournaments/${tournamentId}/setup?message=${encodeURIComponent("Entrants saved.")}`);
}

export async function startTournament(formData: FormData) {
  const { supabase } = await requireAdmin();
  const tournamentId = String(formData.get("tournament_id") ?? "");

  const { data: entrants, error: entrantsError } = await supabase
    .from("tournament_players")
    .select("profile_id, seed")
    .eq("tournament_id", tournamentId)
    .order("seed");
  if (entrantsError) {
    redirect(`/tournaments/${tournamentId}/setup?error=${encodeURIComponent(entrantsError.message)}`);
  }
  const ids = (entrants ?? []).map((e) => e.profile_id as string);
  if (ids.length < MIN_PLAYERS) {
    redirect(
      `/tournaments/${tournamentId}/setup?error=${encodeURIComponent(
        `A tournament needs at least ${MIN_PLAYERS} entrants.`
      )}`
    );
  }

  const matches = generateSingleElim(ids, () => randomUUID());
  const { error } = await supabase.rpc("start_tournament", {
    p_tournament_id: tournamentId,
    p_matches: matches,
  });
  if (error) {
    redirect(`/tournaments/${tournamentId}/setup?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/tournaments/${tournamentId}`);
  redirect(`/tournaments/${tournamentId}`);
}

export async function recordResult(formData: FormData) {
  const { supabase } = await requireAdmin();
  const tournamentId = String(formData.get("tournament_id") ?? "");
  const tournamentMatchId = String(formData.get("tournament_match_id") ?? "");
  const p1 = Number(formData.get("player1_score"));
  const p2 = Number(formData.get("player2_score"));
  const winnerId = String(formData.get("winner_id") ?? "");
  const fail = (message: string): never =>
    redirect(`/tournaments/${tournamentId}?error=${encodeURIComponent(message)}`);

  if (!Number.isInteger(p1) || !Number.isInteger(p2) || p1 < 0 || p2 < 0) {
    fail("Enter both scores as whole numbers.");
  }
  if (p1 === p2) fail("A tournament match cannot end level.");
  if (!winnerId) fail("Pick the winner.");

  // The rated match's id is minted here so the replay can include this result
  // before it is written — the ladder is never briefly wrong.
  const matchId = randomUUID();
  const service = createServiceClient();
  const { data: tm, error: tmError } = await service
    .from("tournament_matches")
    .select("player1_id, player2_id")
    .eq("id", tournamentMatchId)
    .single();
  if (tmError || !tm) fail("That match is no longer available.");

  const payload = await buildRecomputePayload(service, [
    {
      id: matchId,
      reporter_id: tm!.player1_id as string,
      opponent_id: tm!.player2_id as string,
      winner_id: winnerId,
    },
  ]);

  const { error } = await supabase.rpc("record_tournament_result", {
    p_tournament_match_id: tournamentMatchId,
    p_match_id: matchId,
    p_player1_score: p1,
    p_player2_score: p2,
    p_winner_id: winnerId,
    p_played_at: clubDateOf(new Date().toISOString()),
    ...payload,
  });
  if (error) fail(error.message);

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath("/leaderboard");
  revalidatePath("/");
  redirect(`/tournaments/${tournamentId}`);
}

export async function correctScores(formData: FormData) {
  const { supabase } = await requireAdmin();
  const tournamentId = String(formData.get("tournament_id") ?? "");
  const tournamentMatchId = String(formData.get("tournament_match_id") ?? "");
  const p1 = Number(formData.get("player1_score"));
  const p2 = Number(formData.get("player2_score"));
  if (!Number.isInteger(p1) || !Number.isInteger(p2) || p1 < 0 || p2 < 0 || p1 === p2) {
    redirect(
      `/tournaments/${tournamentId}?error=${encodeURIComponent("Enter two different whole-number scores.")}`
    );
  }
  // No recompute: the ladder depends on who won, not by how much.
  const { error } = await supabase.rpc("correct_tournament_scores", {
    p_tournament_match_id: tournamentMatchId,
    p_player1_score: p1,
    p_player2_score: p2,
  });
  if (error) {
    redirect(`/tournaments/${tournamentId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/tournaments/${tournamentId}`);
  redirect(`/tournaments/${tournamentId}?message=${encodeURIComponent("Scores corrected.")}`);
}

export async function voidResult(formData: FormData) {
  const { supabase } = await requireAdmin();
  const tournamentId = String(formData.get("tournament_id") ?? "");
  const tournamentMatchId = String(formData.get("tournament_match_id") ?? "");
  const service = createServiceClient();

  const { data: rated } = await service
    .from("matches")
    .select("id")
    .eq("tournament_match_id", tournamentMatchId)
    .maybeSingle();

  const payload = await buildRecomputePayload(service, [], rated?.id as string | undefined);

  const { error } = await supabase.rpc("void_tournament_result", {
    p_tournament_match_id: tournamentMatchId,
    ...payload,
  });
  if (error) {
    redirect(`/tournaments/${tournamentId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath("/leaderboard");
  revalidatePath("/");
  redirect(
    `/tournaments/${tournamentId}?message=${encodeURIComponent("Result voided and ratings recomputed.")}`
  );
}
