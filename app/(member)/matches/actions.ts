"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordMatchMoments } from "@/lib/activity-write";
import { canFlag } from "@/lib/agreed";
import { confirmPendingMatch } from "@/lib/confirm-match";
import { buildRecomputePayload } from "@/lib/recompute";
import { matchConfirmedPayload, matchDisputedPayload } from "@/lib/push";
import { notify } from "@/lib/push-send";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Match } from "@/lib/types";

async function loadOwnPendingMatch(matchId: string): Promise<Match | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const service = createServiceClient();
  const { data: match } = await service
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .single();
  if (!match || match.status !== "pending" || match.opponent_id !== user.id) {
    return null;
  }
  return match as Match;
}

export async function confirmMatch(formData: FormData) {
  const match = await loadOwnPendingMatch(String(formData.get("match_id")));
  if (!match) {
    redirect(`/?error=${encodeURIComponent("That match can no longer be confirmed.")}`);
  }
  const service = createServiceClient();
  try {
    await confirmPendingMatch(service, match);
  } catch {
    redirect(`/?error=${encodeURIComponent("Could not confirm the match — please try again.")}`);
  }
  await recordMatchMoments(service, match.id);

  // Tell the reporter: the result is in and the rating moved.
  const [{ data: after }, { data: opponent }] = await Promise.all([
    service.from("matches").select("rating_delta_reporter").eq("id", match.id).single(),
    service.from("profiles").select("display_name").eq("id", match.opponent_id).single(),
  ]);
  await notify(service, {
    candidates: [match.reporter_id],
    category: "matches",
    excludeId: match.opponent_id,
    payload: matchConfirmedPayload({
      matchId: match.id,
      opponentName: opponent?.display_name ?? "Your opponent",
      won: match.winner_id === match.reporter_id,
      myScore: match.reporter_score,
      theirScore: match.opponent_score,
      delta: after?.rating_delta_reporter ?? null,
    }),
  });

  revalidatePath("/");
  redirect(`/?message=${encodeURIComponent("Match confirmed — ratings updated.")}`);
}

export async function rejectMatch(formData: FormData) {
  const match = await loadOwnPendingMatch(String(formData.get("match_id")));
  if (!match) {
    redirect(`/?error=${encodeURIComponent("That match can no longer be rejected.")}`);
  }
  const service = createServiceClient();
  const { error } = await service
    .from("matches")
    .update({ status: "disputed" })
    .eq("id", match.id)
    .eq("status", "pending");
  if (error) redirect(`/?error=${encodeURIComponent(error.message)}`);

  const { data: opponent } = await service.from("profiles").select("display_name").eq("id", match.opponent_id).single();
  await notify(service, {
    candidates: [match.reporter_id],
    category: "matches",
    excludeId: match.opponent_id,
    payload: matchDisputedPayload({ matchId: match.id, opponentName: opponent?.display_name ?? "Your opponent" }),
  });

  revalidatePath("/");
  redirect(`/?message=${encodeURIComponent("Sent to the admins to sort out.")}`);
}

// "Not right?" on a game the scorekeeper counted on the spot (spec
// 2026-10-20-agreed-results §2). The undo rebuilds the whole ladder from a
// payload, so it is service-role only; the signed-in opponent is passed in and
// checked inside the function, together with the 24-hour window.
export async function disputeAgreedMatch(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const service = createServiceClient();
  const { data: match } = await service
    .from("matches")
    .select("*")
    .eq("id", String(formData.get("match_id") ?? ""))
    .maybeSingle();
  if (!match || !canFlag(match, user.id, new Date())) {
    redirect(`/?error=${encodeURIComponent("That game can no longer be flagged.")}`);
  }

  let failure: string | null = null;
  try {
    const payload = await buildRecomputePayload(service, [], match.id);
    const { error } = await service.rpc("undo_agreed_match", {
      p_match_id: match.id,
      p_opponent_id: user.id,
      ...payload,
    });
    if (error) failure = error.message;
  } catch (err) {
    failure = err instanceof Error ? err.message : "Could not flag that game — try again.";
  }
  if (failure) redirect(`/?error=${encodeURIComponent(failure)}`);

  const { data: opponent } = await service.from("profiles").select("display_name").eq("id", user.id).single();
  await notify(service, {
    candidates: [match.reporter_id],
    category: "matches",
    excludeId: user.id,
    payload: matchDisputedPayload({ matchId: match.id, opponentName: opponent?.display_name ?? "Your opponent" }),
  });

  revalidatePath("/");
  redirect(`/?message=${encodeURIComponent("Taken out of the ratings — an admin will sort it out.")}`);
}
