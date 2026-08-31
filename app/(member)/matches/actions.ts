"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { confirmPendingMatch } from "@/lib/confirm-match";
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
  await confirmPendingMatch(createServiceClient(), match);
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
  revalidatePath("/");
  redirect(`/?message=${encodeURIComponent("Sent to the admins to sort out.")}`);
}
