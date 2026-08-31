"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  if (invalid) {
    redirect(`/matches/new?error=${encodeURIComponent("Enter a valid, non-tied score")}`);
  }

  const { error } = await supabase.from("matches").insert({
    reporter_id: user.id,
    opponent_id: opponentId,
    winner_id: myScore > theirScore ? user.id : opponentId,
    reporter_score: myScore,
    opponent_score: theirScore,
    game_type: String(formData.get("game_type") ?? "8ball"),
    played_at: String(formData.get("played_at")),
  });
  if (error) redirect(`/matches/new?error=${encodeURIComponent(error.message)}`);
  redirect(`/?message=${encodeURIComponent("Match reported — waiting on your opponent to confirm.")}`);
}
