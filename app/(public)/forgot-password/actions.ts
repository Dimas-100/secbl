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
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  // Deliberately the same response whether or not the account exists — this
  // form would otherwise tell a stranger which club members are registered.
  // Supabase's own errors are swallowed for the same reason.
  redirect(`/forgot-password?message=${encodeURIComponent(SENT)}`);
}
