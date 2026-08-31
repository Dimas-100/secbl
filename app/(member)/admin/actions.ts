"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
