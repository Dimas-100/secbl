"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordMatchMoments } from "@/lib/activity-write";
import { confirmPendingMatch } from "@/lib/confirm-match";
import { clubDateOf } from "@/lib/events";
import { seasonClosedPayload, seasonOpenedPayload } from "@/lib/push";
import { notifyAllMembers } from "@/lib/push-send";
import { validateResult } from "@/lib/race";
import { seasonChampion } from "@/lib/season";
import { loadSeasonById, loadSeasonStandings } from "@/lib/season-data";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { assertPublicFeedUrl, syncAllSources } from "@/lib/sync-sources";
import { adminClearPost, deletePost } from "@/app/(member)/posts/actions";

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
  return { supabase, user };
}

// Suspending keeps everything — matches, ratings, history — and only revokes
// access, because is_approved() gates every policy on status = 'approved'.
// Reinstating restores the member exactly as they were.
async function setMembership(formData: FormData, status: "suspended" | "approved") {
  const { supabase, user } = await requireAdmin();
  const profileId = String(formData.get("profile_id") ?? "");
  if (!profileId) {
    redirect(`/admin?error=${encodeURIComponent("No member selected.")}`);
  }
  // Without this an admin can suspend themselves, and if they are the only
  // admin there is nobody left who can undo it.
  if (profileId === user.id) {
    redirect(`/admin?error=${encodeURIComponent("You cannot suspend your own account.")}`);
  }
  const { error } = await supabase.from("profiles").update({ status }).eq("id", profileId);
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin");
  revalidatePath("/leaderboard");
}

export async function suspendProfile(formData: FormData) {
  await setMembership(formData, "suspended");
}

export async function reinstateProfile(formData: FormData) {
  await setMembership(formData, "approved");
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
  // The winner must be the higher score, and a race keeps its format: the
  // same rule the reporter was held to, so the DB's check constraints never
  // surface as a raw error here.
  if ((winnerId === match.reporter_id) !== reporterScore > opponentScore) {
    redirect(`/admin?error=${encodeURIComponent("The winner must have the higher score.")}`);
  }
  const problem = validateResult({
    reporterId: match.reporter_id,
    opponentId: match.opponent_id,
    reporterScore,
    opponentScore,
    raceTo: match.race_to,
    spot: match.spot,
    spotTo: match.spot_to,
  });
  if (problem) {
    redirect(`/admin?error=${encodeURIComponent(`${problem}.`)}`);
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
  await recordMatchMoments(service, matchId);
  revalidatePath("/admin");
}

// --- Event sources (PIN / Engage iCal feeds) -------------------------------

export async function addEventSource(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const feedUrl = String(formData.get("feed_url") ?? "").trim();
  const schoolId = String(formData.get("school_id") ?? "") || null;
  if (!name) redirect(`/admin?error=${encodeURIComponent("Give the source a short name, like PIN.")}`);
  // The server will fetch this URL, so it must be a public https host — no
  // private networks, IP literals or credentials (SSRF guard).
  let parsed: URL;
  try {
    parsed = await assertPublicFeedUrl(feedUrl);
  } catch (err) {
    redirect(`/admin?error=${encodeURIComponent(err instanceof Error ? err.message : "That feed link can't be used.")}`);
  }
  const { data, error } = await supabase
    .from("event_sources")
    .insert({ name: name.slice(0, 40), feed_url: parsed.toString(), school_id: schoolId, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) {
    const message = /unique|duplicate/i.test(error?.message ?? "")
      ? "That feed is already connected."
      : (error?.message ?? "Could not add the source.");
    redirect(`/admin?error=${encodeURIComponent(message)}`);
  }
  // First sync right away so the admin sees whether the feed works.
  const [result] = await syncAllSources(createServiceClient(), { onlyId: data.id });
  revalidatePath("/admin");
  revalidatePath("/events");
  revalidatePath("/");
  if (result && !result.ok) {
    redirect(`/admin?error=${encodeURIComponent(`Connected, but the first sync failed: ${result.error}`)}`);
  }
  redirect(`/admin?message=${encodeURIComponent(`Connected ${name}. Imported ${result?.imported ?? 0} event(s).`)}`);
}

export async function removeEventSource(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("source_id") ?? "");
  // Events already imported stay as ordinary events (source_id goes null).
  const { error } = await supabase.from("event_sources").delete().eq("id", id);
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin");
  revalidatePath("/events");
}

export async function syncEventSourcesNow() {
  await requireAdmin();
  const results = await syncAllSources(createServiceClient());
  revalidatePath("/admin");
  revalidatePath("/events");
  revalidatePath("/");
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    redirect(`/admin?error=${encodeURIComponent(`${failed.map((f) => f.name).join(", ")}: ${failed[0].error}`)}`);
  }
  const imported = results.reduce((n, r) => n + r.imported, 0);
  const updated = results.reduce((n, r) => n + r.updated, 0);
  const cancelled = results.reduce((n, r) => n + r.cancelled, 0);
  redirect(
    `/admin?message=${encodeURIComponent(`Synced ${results.length} source(s): ${imported} new, ${updated} updated, ${cancelled} cancelled.`)}`
  );
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

// Records a school's logo URL after the browser uploaded it. The database
// function requires an admin; this adds the host and per-school path check so
// a logo can never point outside this project's own bucket.
export async function setSchoolLogo(schoolId: string, url: string | null): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in again." };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(schoolId)) {
    return { error: "Unknown school." };
  }
  if (url !== null) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { error: "That logo link is not valid." };
    }
    const storageHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
    const expectedPath = `/storage/v1/object/public/school-logos/${schoolId}/`;
    if (parsed.protocol !== "https:" || parsed.hostname !== storageHost || !parsed.pathname.startsWith(expectedPath)) {
      return { error: "Logos must be uploaded through the app." };
    }
  }
  const { error } = await supabase.rpc("set_school_logo", { p_school_id: schoolId, p_url: url });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { error: null };
}

// --- Seasons (spec 2026-10-06-seasons-feed-live §1) ---------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function openSeason(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  // season_name, not name: the event-source form below it already owns `name`.
  const name = String(formData.get("season_name") ?? "").trim();
  const startsOn = String(formData.get("starts_on") ?? "");
  const endsOn = String(formData.get("ends_on") ?? "").trim();
  if (!name) redirect(`/admin?error=${encodeURIComponent("A season needs a name.")}`);
  if (!DATE.test(startsOn)) redirect(`/admin?error=${encodeURIComponent("Pick a start date.")}`);
  if (endsOn && !DATE.test(endsOn)) redirect(`/admin?error=${encodeURIComponent("That end date isn't valid.")}`);
  // The function enforces the invariants (one open season, dates in order).
  const { data: id, error } = await supabase.rpc("open_season", {
    p_name: name,
    p_starts_on: startsOn,
    p_ends_on: endsOn || null,
  });
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  await notifyAllMembers(createServiceClient(), {
    category: "league",
    excludeId: user.id,
    payload: seasonOpenedPayload({ seasonId: String(id), name, endsOn: endsOn || null }),
  });
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/leaderboard");
  redirect(`/admin?message=${encodeURIComponent(`${name} is open.`)}`);
}

export async function endSeason(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const seasonId = String(formData.get("season_id") ?? "");
  const season = await loadSeasonById(supabase, seasonId);
  if (!season || season.status !== "open") {
    redirect(`/admin?error=${encodeURIComponent("That season is not open.")}`);
  }
  const standings = await loadSeasonStandings(supabase, season);
  const champion = seasonChampion(standings);
  const podium = standings
    .filter((s) => s.played > 0)
    .slice(0, 3)
    .map((s) => ({ id: s.id, points: s.points }));
  const { error } = await supabase.rpc("close_season", {
    p_season_id: seasonId,
    p_champion_id: champion?.id ?? null,
    p_today: clubDateOf(new Date().toISOString()),
    p_podium: podium,
  });
  if (error) redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  await notifyAllMembers(createServiceClient(), {
    category: "league",
    excludeId: user.id,
    payload: seasonClosedPayload({
      seasonId,
      name: season.name,
      championName: champion?.display_name ?? null,
      points: champion?.points ?? 0,
    }),
  });
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/leaderboard");
  redirect(
    `/admin?message=${encodeURIComponent(
      champion ? `${season.name} closed — ${champion.display_name} is champion.` : `${season.name} closed.`
    )}`
  );
}

// --- Posts moderation (spec 2026-10-07-posts-design §3, §9) ------------------

export async function adminClearPostForm(formData: FormData) {
  await requireAdmin();
  const r = await adminClearPost(String(formData.get("post_id") ?? ""));
  if (r.error) redirect(`/admin?error=${encodeURIComponent(r.error)}`);
  redirect(`/admin?message=${encodeURIComponent("Post restored to the feed.")}`);
}

export async function adminDeletePostForm(formData: FormData) {
  await requireAdmin();
  const r = await deletePost(String(formData.get("post_id") ?? ""));
  if (r.error) redirect(`/admin?error=${encodeURIComponent(r.error)}`);
  redirect(`/admin?message=${encodeURIComponent("Post deleted.")}`);
}
