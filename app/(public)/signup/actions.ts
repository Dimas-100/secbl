"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signup(formData: FormData) {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const schoolId = String(formData.get("school_id") ?? "");
  if (!displayName || !schoolId) {
    redirect(`/signup?error=${encodeURIComponent("Name and school are required")}`);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
    options: { data: { display_name: displayName, school_id: schoolId } },
  });
  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  // Membership is open (the invitation link is the gate): the signup trigger
  // approves the profile, so with a session the member goes straight in.
  // Without one (email confirmation on) they confirm by email first.
  if (data.session) redirect("/");
  redirect(`/login?message=${encodeURIComponent("Check your email to confirm, then log in.")}`);
}
