import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/server";
import { signup } from "./actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: schools } = await supabase
    .from("schools")
    .select("id, name")
    .order("name");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-bold">Join SECBL</h1>
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      <form action={signup} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="display_name">Display name</Label>
          <Input id="display_name" name="display_name" required maxLength={40} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="school_id">School</Label>
          <select
            id="school_id"
            name="school_id"
            required
            defaultValue=""
            className="border-input bg-transparent h-9 rounded-md border px-3 text-sm shadow-xs"
          >
            <option value="" disabled>
              Choose your school
            </option>
            {(schools ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required minLength={8} />
        </div>
        <Button type="submit">Create account</Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Already a member?{" "}
        <Link className="underline" href="/login">
          Log in
        </Link>
      </p>
    </main>
  );
}
