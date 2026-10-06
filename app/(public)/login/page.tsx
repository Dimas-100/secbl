import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Field, PublicShell } from "@/components/public-shell";
import { SchoolMark, type SchoolMarkSchool } from "@/components/school-mark";
import { createClient } from "@/lib/supabase/server";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  const supabase = await createClient();
  const { data: schools } = await supabase
    .from("schools")
    .select("id, name, short_name, primary_color, logo_url")
    .order("short_name");

  return (
    <PublicShell title="Welcome back." lead="Log in to see the ladder, log a game, and find your room.">
      {message && <p className="bg-card rounded-2xl p-3 text-sm shadow-[inset_0_0_0_1px_var(--hairline-row)]">{message}</p>}
      {error && <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>}
      <form action={login} className="flex flex-col gap-5">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@school.edu" />
        </Field>
        <Field label="Password" htmlFor="password">
          <PasswordInput id="password" name="password" required autoComplete="current-password" />
        </Field>
        <Button type="submit" size="xl" className="w-full">
          Log in
        </Button>
        <Link href="/forgot-password" className="text-muted-foreground text-center text-[13px]">
          Forgot your password?
        </Link>
      </form>

      {/* New members start by tapping their school: it lands on signup with
          the school already chosen, so the first screen already feels theirs. */}
      <section className="border-hairline-divider flex flex-col gap-4 border-t pt-6">
        <div className="flex flex-col gap-1 text-center">
          <span className="eyebrow">New here?</span>
          <p className="text-[14px]">Tap your school to join the league.</p>
        </div>
        <ul className="grid grid-cols-5 gap-2">
          {((schools ?? []) as (SchoolMarkSchool & { id: string; name: string })[]).map((s) => (
            <li key={s.id}>
              <Link
                href={`/signup?school=${s.id}`}
                aria-label={`Join as ${s.name}`}
                className="press bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-[16px] py-3 text-[11px] font-medium shadow-[inset_0_0_0_1px_var(--hairline-row)]"
              >
                <SchoolMark school={s} size={36} />
                {s.short_name}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-center gap-4 text-[13px]">
          <Link href="/signup" className="text-brass">
            Create an account
          </Link>
          <span aria-hidden="true" className="bg-muted-foreground/60 size-[3px] rounded-full" />
          <Link href="/install" className="text-muted-foreground">
            Get the app
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
