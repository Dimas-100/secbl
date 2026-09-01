import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(public)/login/actions";
import { updateDisplayName } from "./actions";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, rating, matches_played, schools(short_name, name)")
    .eq("id", user.id)
    .single();
  const school = Array.isArray(profile?.schools) ? profile.schools[0] : profile?.schools;

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Settings</h1>
      {message && <p className="rounded-md bg-muted p-3 text-sm">{message}</p>}
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your name</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={updateDisplayName} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="display_name">Display name</Label>
              <Input
                id="display_name"
                name="display_name"
                required
                maxLength={40}
                defaultValue={profile?.display_name ?? ""}
              />
            </div>
            <Button type="submit" className="self-start">
              Save name
            </Button>
          </form>
          <p className="text-muted-foreground text-xs">
            This is how you appear on the leaderboard and in match reports.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p className="text-muted-foreground">{user.email}</p>
          <p>
            <Badge variant="secondary">{school?.short_name}</Badge>{" "}
            <span className="text-muted-foreground">{school?.name}</span>
          </p>
          <p className="text-muted-foreground">
            Rating {profile?.rating} · {profile?.matches_played} matches played
          </p>
          <p className="text-muted-foreground text-xs">
            Ask a club admin if your school is wrong.
          </p>
        </CardContent>
      </Card>

      {/* Moved out of the header when it slimmed down to the avatar chip. */}
      <form action={logout}>
        <Button variant="outline" className="text-destructive w-full">
          Log out
        </Button>
      </form>
    </main>
  );
}
