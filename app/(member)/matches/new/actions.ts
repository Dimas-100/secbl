"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordMatchMoments } from "@/lib/activity-write";
import { confirmPendingMatch } from "@/lib/confirm-match";
import { GAME_LABEL } from "@/lib/identity";
import { freeTableAfterReport } from "@/lib/night-data";
import { matchAgreedPayload, matchReportedPayload } from "@/lib/push";
import { notify } from "@/lib/push-send";
import { formatShort, validateResult } from "@/lib/race";
import { findDuplicate, type DuplicateGame, type PairMatchRow } from "@/lib/report-form";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Match } from "@/lib/types";
import { confirmMatch } from "../actions";

function fail(message: string): never {
  redirect(`/matches/new?error=${encodeURIComponent(message)}`);
}

// A pending or confirmed game between these two on that day, if any. Both
// directions: the pair is matched with two IN lists (reporter ≠ opponent is a
// table constraint), so no user input is spliced into a filter string.
async function loadDuplicate(
  supabase: SupabaseClient,
  meId: string,
  opponentId: string,
  playedAt: string
): Promise<DuplicateGame | null> {
  if (!opponentId || !playedAt) return null;
  const [{ data }, { data: calledAt }] = await Promise.all([
    supabase
      .from("matches")
      .select("id, status, reporter_id, opponent_id, reporter_score, opponent_score, played_at, created_at")
      .eq("played_at", playedAt)
      .in("status", ["pending", "confirmed"])
      .in("reporter_id", [meId, opponentId])
      .in("opponent_id", [meId, opponentId]),
    // When you two were called to a club-night table, if you were: a game
    // logged before that is not this one.
    supabase.rpc("night_table_call", { p_other: opponentId }),
  ]);
  return findDuplicate(
    (data ?? []) as PairMatchRow[],
    meId,
    opponentId,
    playedAt,
    typeof calledAt === "string" ? calledAt : null
  );
}

// Asked by the form when Send is tapped, before anything is written.
export async function findDuplicateReport(opponentId: string, playedAt: string): Promise<DuplicateGame | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return loadDuplicate(supabase, user.id, String(opponentId), String(playedAt));
}

// "Confirm theirs" from the duplicate notice: the board is finished with, so
// it leaves Live now, then the opponent's report is confirmed as from Home.
export async function confirmTheirs(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const service = createServiceClient();
  await service.from("live_games").delete().eq("reporter_id", user.id);
  // Confirming their report ends the game, so a club-night table the two of
  // you hold is free now. Before confirmMatch, which ends in a redirect.
  const { data: theirs } = await service
    .from("matches")
    .select("reporter_id, opponent_id")
    .eq("id", String(formData.get("match_id") ?? ""))
    .maybeSingle();
  if (theirs && theirs.opponent_id === user.id) {
    await freeTableAfterReport(supabase, service, theirs.reporter_id, user.id);
  }
  await confirmMatch(formData);
}

export async function reportMatch(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const opponentId = String(formData.get("opponent_id") ?? "");
  const myScore = Number(formData.get("my_score"));
  const theirScore = Number(formData.get("their_score"));
  const invalid =
    !opponentId ||
    opponentId === user.id ||
    !Number.isInteger(myScore) ||
    !Number.isInteger(theirScore) ||
    myScore < 0 ||
    theirScore < 0 ||
    myScore === theirScore;
  if (invalid) fail("Enter a valid, non-tied score");

  // Format (spec 2026-10-06-live-club §7). Scores already include the spot.
  const rawRace = String(formData.get("race_to") ?? "");
  const raceTo = rawRace === "" ? null : Number(rawRace);
  const spot = Number(formData.get("spot") ?? 0);
  const rawSpotTo = String(formData.get("spot_to") ?? "");
  const spotTo = rawSpotTo === "me" ? user.id : rawSpotTo === "them" ? opponentId : null;
  if (raceTo !== null && (!Number.isInteger(raceTo) || raceTo < 1 || raceTo > 25)) fail("Pick a race length");
  if (!Number.isInteger(spot) || spot < 0) fail("That spot doesn't fit the race");
  const problem = validateResult({
    reporterId: user.id,
    opponentId,
    reporterScore: myScore,
    opponentScore: theirScore,
    raceTo,
    spot,
    spotTo,
  });
  if (problem) fail(problem);

  // The form already asked; this catches two players sending the same game
  // at the same moment. "Log as a new game" is the deliberate way past it.
  const playedAt = String(formData.get("played_at"));
  if (formData.get("allow_duplicate") !== "1" && (await loadDuplicate(supabase, user.id, opponentId, playedAt))) {
    fail("You two already have a game logged that day — check Home before sending it again.");
  }

  const gameType = String(formData.get("game_type") ?? "8ball");
  // The whole row: an agreed game goes straight into confirmPendingMatch,
  // which reads the players and the winner from it.
  const { data: created, error } = await supabase
    .from("matches")
    .insert({
      reporter_id: user.id,
      opponent_id: opponentId,
      winner_id: myScore > theirScore ? user.id : opponentId,
      reporter_score: myScore,
      opponent_score: theirScore,
      game_type: gameType,
      played_at: playedAt,
      race_to: raceTo,
      spot,
      spot_to: spotTo,
    })
    .select("*")
    .single();
  if (error || !created) fail(error?.message ?? "Could not save the match");

  // The table is no longer live once the result is sent.
  const service = createServiceClient();
  await service.from("live_games").delete().eq("reporter_id", user.id);

  const [{ data: reporter }, { data: opponent }] = await Promise.all([
    service.from("profiles").select("display_name").eq("id", user.id).single(),
    service.from("profiles").select("display_name").eq("id", opponentId).single(),
  ]);
  const game = {
    matchId: created.id as string,
    reporterName: reporter?.display_name ?? "A member",
    reporterScore: myScore,
    opponentScore: theirScore,
    gameLabel: GAME_LABEL[gameType] ?? gameType,
    format: formatShort(raceTo, spot),
  };

  // "We agreed — count it" (spec 2026-10-20-agreed-results §2): confirmed
  // now, and the opponent is told they have a day to flag it. If counting
  // fails the report simply stays pending, as if it had been sent.
  let counted = false;
  if (formData.get("agreed") === "1") {
    try {
      await confirmPendingMatch(service, created as Match, { agreed: true });
      counted = true;
    } catch (err) {
      console.error("agreed confirmation failed", err);
    }
  }
  // The result is in either way: a club-night table you two hold is free now.
  await freeTableAfterReport(supabase, service, opponentId, user.id);
  if (counted) {
    await recordMatchMoments(service, created.id);
    await notify(service, {
      candidates: [opponentId],
      category: "matches",
      excludeId: user.id,
      payload: matchAgreedPayload(game),
    });
    revalidatePath("/");
    redirect(`/?message=${encodeURIComponent("Counted — ratings updated.")}`);
  }

  // Tell the opponent there is something to confirm.
  await notify(service, {
    candidates: [opponentId],
    category: "matches",
    excludeId: user.id,
    payload: matchReportedPayload(game),
  });
  if (formData.get("agreed") === "1") {
    const first = (opponent?.display_name ?? "your opponent").trim().split(/\s+/)[0];
    redirect(`/?message=${encodeURIComponent(`Couldn't count it right away — sent to ${first} to confirm instead.`)}`);
  }
  redirect(`/?message=${encodeURIComponent("Match reported — waiting on your opponent to confirm.")}`);
}
