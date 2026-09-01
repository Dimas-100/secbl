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
