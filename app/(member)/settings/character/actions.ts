"use server";

import { revalidatePath } from "next/cache";
import { charactersEnabled, sanitizeLook, starterLook } from "@/lib/character";
import { loadCharacterProgress } from "@/lib/character-data";
import { ballFor } from "@/lib/identity";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// Save the caller's character. The look is checked here, against what the
// member has actually earned, and anything they haven't (or anything that
// isn't a real part) is swapped for their starter's. Members have no update
// policy on profiles, so the write goes through the service role, for the
// caller's own row only.
export async function saveLook(raw: unknown): Promise<{ error?: string }> {
  if (!charactersEnabled()) return { error: "Characters aren't on yet." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in again to save." };

  const { data: profile } = await supabase.from("profiles").select("ball, status").eq("id", user.id).single();
  if (!profile || profile.status !== "approved") return { error: "Only approved members can save a character." };

  const progress = await loadCharacterProgress(supabase, user.id);
  const look = sanitizeLook(raw, starterLook(user.id, ballFor(profile.ball, user.id).number, progress), progress);

  const { error } = await createServiceClient().from("profiles").update({ look }).eq("id", user.id);
  if (error) return { error: "Couldn't save your character. Try again." };

  // Every avatar reads the looks the member shell loads.
  revalidatePath("/", "layout");
  return {};
}
