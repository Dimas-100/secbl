"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MIN_LENGTH = 8;

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < MIN_LENGTH) {
    redirect(
      `/reset-password?error=${encodeURIComponent(`Use at least ${MIN_LENGTH} characters.`)}`
    );
  }
  if (password !== confirm) {
    redirect(`/reset-password?error=${encodeURIComponent("Those passwords do not match.")}`);
  }

  const supabase = await createClient();
  // The recovery link already established the session; without it there is
  // nobody to update, so send them back to ask for a fresh link.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/forgot-password?error=${encodeURIComponent(
        "That link has expired or was already used. Request a new one."
      )}`
    );
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/?message=${encodeURIComponent("Password updated.")}`);
}
