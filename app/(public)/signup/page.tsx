import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Field, PublicShell } from "@/components/public-shell";
import { SchoolPicker, type PickableSchool } from "@/components/school-picker";
import { createClient } from "@/lib/supabase/server";
import { signup } from "./actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; school?: string }>;
}) {
  const { error, school } = await searchParams;
  const supabase = await createClient();
  const { data: schools } = await supabase
    .from("schools")
    .select("id, name, short_name, primary_color, logo_url")
    .order("short_name");

  return (
    <PublicShell
      compact
      eyebrow="Join the league"
      title="Pick your school, pick a name."
      lead="An admin approves new members, usually the same day."
    >
      {error && <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>}
      <form action={signup} className="flex flex-col gap-6">
        <SchoolPicker schools={(schools ?? []) as PickableSchool[]} defaultValue={school ?? null} />
        <Field label="Display name" htmlFor="display_name" hint="How you appear on the leaderboard.">
          <Input id="display_name" name="display_name" required maxLength={40} autoComplete="nickname" placeholder="Dennis H." />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@school.edu" />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <Button type="submit" size="xl" className="w-full">
          Create account
        </Button>
      </form>
      <p className="text-muted-foreground text-center text-[13px]">
        Already a member?{" "}
        <Link className="text-brass" href="/login">
          Log in
        </Link>
      </p>
    </PublicShell>
  );
}
