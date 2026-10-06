import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, PublicShell } from "@/components/public-shell";
import { requestPasswordReset } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  return (
    <PublicShell title="Reset your password" lead="We'll email you a link that signs you in to choose a new one.">
      {message && <p className="bg-card rounded-2xl p-3 text-sm shadow-[inset_0_0_0_1px_var(--hairline-row)]">{message}</p>}
      {error && <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>}
      <form action={requestPasswordReset} className="flex flex-col gap-6">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" required autoComplete="email" inputMode="email" />
        </Field>
        <Button type="submit" size="xl" className="w-full">
          Send reset link
        </Button>
      </form>
      <p className="text-muted-foreground text-center text-[13px]">
        Remembered it?{" "}
        <Link className="text-brass" href="/login">
          Back to log in
        </Link>
      </p>
    </PublicShell>
  );
}
