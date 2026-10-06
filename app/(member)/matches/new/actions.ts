"use server";

import { redirect } from "next/navigation";
import { GAME_LABEL } from "@/lib/identity";
import { matchReportedPayload } from "@/lib/push";
import { notify } from "@/lib/push-send";
import { formatShort } from "@/lib/race";
import { createClient, createServiceClient } from "@/lib/supabase/server";

function fail(message: string): never {
  redirect(`/matches/new?error=${encodeURIComponent(message)}`);
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
  if ((spot === 0) !== (spotTo === null)) fail("That spot doesn't fit the race");
  if (raceTo !== null) {
    if (spot >= raceTo) fail("That spot doesn't fit the race");
    if (Math.max(myScore, theirScore) !== raceTo || Math.min(myScore, theirScore) >= raceTo) {
      fail("That race isn't finished yet");
    }
  } else if (spot > 0) {
    fail("A spot needs a race");
  }

  const gameType = String(formData.get("game_type") ?? "8ball");
  const { data: created, error } = await supabase
    .from("matches")
    .insert({
      reporter_id: user.id,
      opponent_id: opponentId,
      winner_id: myScore > theirScore ? user.id : opponentId,
      reporter_score: myScore,
      opponent_score: theirScore,
      game_type: gameType,
      played_at: String(formData.get("played_at")),
      race_to: raceTo,
      spot,
      spot_to: spotTo,
    })
    .select("id")
    .single();
  if (error || !created) fail(error?.message ?? "Could not save the match");

  // Tell the opponent there is something to confirm.
  const service = createServiceClient();
  const { data: reporter } = await service.from("profiles").select("display_name").eq("id", user.id).single();
  await notify(service, {
    candidates: [opponentId],
    category: "matches",
    excludeId: user.id,
    payload: matchReportedPayload({
      matchId: created.id,
      reporterName: reporter?.display_name ?? "A member",
      reporterScore: myScore,
      opponentScore: theirScore,
      gameLabel: GAME_LABEL[gameType] ?? gameType,
      format: formatShort(raceTo, spot),
    }),
  });
  redirect(`/?message=${encodeURIComponent("Match reported — waiting on your opponent to confirm.")}`);
}
