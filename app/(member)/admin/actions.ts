"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { confirmPendingMatch } from "@/lib/confirm-match";
import { createClient, createServiceClient } from "@/lib/supabase/server";

async function setStatus(formData: FormData, status: "approved" | "rejected") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // RLS is the real guard: only admins can update profiles.
  const { error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", String(formData.get("profile_id")));
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin");
}

export async function approveProfile(formData: FormData) {
  await setStatus(formData, "approved");
}

export async function rejectProfile(formData: FormData) {
  await setStatus(formData, "rejected");
}

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
  if (me?.role !== "admin") redirect("/");
}

export async function adminResolveMatch(formData: FormData) {
  await requireAdmin();
  const matchId = String(formData.get("match_id"));
  const winnerId = String(formData.get("winner_id"));
  const reporterScore = Number(formData.get("reporter_score"));
  const opponentScore = Number(formData.get("opponent_score"));
  const service = createServiceClient();
  const { data: match } = await service
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .single();
  if (!match || match.status !== "disputed") {
    redirect(`/admin?error=${encodeURIComponent("Match is not disputed.")}`);
  }
  if (
    ![match.reporter_id, match.opponent_id].includes(winnerId) ||
    !Number.isInteger(reporterScore) ||
    !Number.isInteger(opponentScore) ||
    reporterScore < 0 ||
    opponentScore < 0
  ) {
    redirect(`/admin?error=${encodeURIComponent("Invalid resolution.")}`);
  }
  const { data: updated, error } = await service
    .from("matches")
    .update({
      winner_id: winnerId,
      reporter_score: reporterScore,
      opponent_score: opponentScore,
      status: "pending",
    })
    .eq("id", matchId)
    .select()
    .single();
  if (error || !updated) {
    redirect(`/admin?error=${encodeURIComponent(error?.message ?? "update failed")}`);
  }
  try {
    await confirmPendingMatch(service, updated);
  } catch {
    // Compensate: put the match back in the disputes queue so the admin can retry.
    await service
      .from("matches")
      .update({ status: "disputed" })
      .eq("id", matchId)
      .eq("status", "pending");
    redirect(
      `/admin?error=${encodeURIComponent("Confirmation failed — the match is back in the disputes queue. Try again.")}`
    );
  }
  revalidatePath("/admin");
}

export async function adminRejectMatch(formData: FormData) {
  await requireAdmin();
  const service = createServiceClient();
  const { error } = await service
    .from("matches")
    .update({ status: "rejected" })
    .eq("id", String(formData.get("match_id")))
    .eq("status", "disputed");
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin");
}
