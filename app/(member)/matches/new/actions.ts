"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  const { error } = await supabase.from("matches").insert({
    reporter_id: user.id,
    opponent_id: opponentId,
    winner_id: myScore > theirScore ? user.id : opponentId,
    reporter_score: myScore,
    opponent_score: theirScore,
    game_type: String(formData.get("game_type") ?? "8ball"),
    played_at: String(formData.get("played_at")),
    race_to: raceTo,
    spot,
    spot_to: spotTo,
  });
  if (error) fail(error.message);
  redirect(`/?message=${encodeURIComponent("Match reported — waiting on your opponent to confirm.")}`);
}
