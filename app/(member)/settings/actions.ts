"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updateDisplayName(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) {
    redirect(`/settings?error=${encodeURIComponent("Your name cannot be blank.")}`);
  }
  if (displayName.length > 40) {
    redirect(`/settings?error=${encodeURIComponent("Keep it to 40 characters or fewer.")}`);
  }

  // Goes through the SECURITY DEFINER function rather than a direct update:
  // profiles has no member-facing UPDATE policy, and adding one would also
  // expose rating, role and status on the same row. The function is the only
  // path that can change a name, and it enforces who may change whose.
  const { error } = await supabase.rpc("update_display_name", {
    p_profile_id: user.id,
    p_display_name: displayName,
  });
  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/settings");
  revalidatePath("/leaderboard");
  revalidatePath("/");
  redirect(`/settings?message=${encodeURIComponent("Name updated.")}`);
}

const GAME_TYPES = new Set(["8ball", "9ball", "10ball", "other"]);

// Ball, tagline and favourite game in one save. The database function owns
// the rules (approved caller, own row, ranges); this just shapes the form.
export async function updateProfilePrefs(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawBall = String(formData.get("ball") ?? "");
  const ball = rawBall === "" ? null : Number(rawBall);
  if (ball !== null && (!Number.isInteger(ball) || ball < 1 || ball > 15)) {
    redirect(`/settings?error=${encodeURIComponent("Pick a ball from the rack.")}`);
  }
  const tagline = String(formData.get("tagline") ?? "").trim();
  if (tagline.length > 60) {
    redirect(`/settings?error=${encodeURIComponent("Keep the tagline to 60 characters.")}`);
  }
  const rawGame = String(formData.get("favorite_game") ?? "");
  const favoriteGame = GAME_TYPES.has(rawGame) ? rawGame : null;

  const { error } = await supabase.rpc("update_profile_prefs", {
    p_ball: ball,
    p_tagline: tagline || null,
    p_favorite_game: favoriteGame,
  });
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/settings");
  revalidatePath("/leaderboard");
  revalidatePath("/");
  redirect(`/settings?message=${encodeURIComponent("Profile updated.")}`);
}

// Called by the photo uploader after the file is in Storage, or to remove.
export async function setAvatarUrl(url: string | null): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in again." };
  const { error } = await supabase.rpc("set_avatar_url", { p_url: url });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { error: null };
}
