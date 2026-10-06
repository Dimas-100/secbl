import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/password-input";
import { Field, PublicShell } from "@/components/public-shell";
import { createClient } from "@/lib/supabase/server";
import { updatePassword } from "./actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // Reached only with the session the recovery link created. Someone opening
  // this URL cold has nothing to update, so point them at the request form
  // instead of showing a password box that cannot work.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/forgot-password?error=${encodeURIComponent(
        "Open the link from your email to set a new password."
      )}`
    );
  }

  return (
    <PublicShell title="Choose a new password" lead="At least 8 characters. You'll be logged in straight after.">
      {error && <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>}
      <form action={updatePassword} className="flex flex-col gap-6">
        <Field label="New password" htmlFor="password">
          <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm">
          <PasswordInput id="confirm" name="confirm" required minLength={8} autoComplete="new-password" />
        </Field>
        <Button type="submit" size="xl" className="w-full">
          Update password
        </Button>
      </form>
    </PublicShell>
  );
}
