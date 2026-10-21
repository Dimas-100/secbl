"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const SENT =
  "If that email has an account, a reset link is on its way. Check your inbox and spam.";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    redirect(`/forgot-password?error=${encodeURIComponent("Enter your email address.")}`);
  }

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  // Deliberately the same response whether or not the account exists — this
  // form would otherwise tell a stranger which club members are registered.
  // Supabase's own errors stay off the page for the same reason (a rate-limit
  // refusal only comes back for a real account), but they are logged, so a
  // send Supabase refused shows up in Vercel's logs instead of nowhere.
  if (error) console.error("password reset: email not sent", error.status, error.code, error.message);
  redirect(`/forgot-password?message=${encodeURIComponent(SENT)}`);
}
