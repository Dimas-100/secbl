import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { SectionLabel } from "@/components/section-label";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(public)/login/actions";
import { updateDisplayName } from "./actions";
import { LookEditor } from "./look-editor";

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
    .select("display_name, rating, matches_played, avatar_url, ball, tagline, favorite_game, schools(short_name, name)")
    .eq("id", user.id)
    .single();
  const school = Array.isArray(profile?.schools) ? profile.schools[0] : profile?.schools;

  return (
    <main>
      <PageHeader title="Settings" back={`/players/${user.id}`} trailing={null} />
      <div className="mt-6 flex flex-col gap-6">
      {message && <p className="bg-card rounded-2xl p-3 text-sm shadow-[inset_0_0_0_1px_var(--hairline-row)]">{message}</p>}
      {error && (
        <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>
      )}

      <Card>
        <CardHeader>
          <SectionLabel>Your look</SectionLabel>
        </CardHeader>
        <CardContent>
          <LookEditor
            profileId={user.id}
            displayName={profile?.display_name ?? ""}
            avatarUrl={profile?.avatar_url ?? null}
            ball={profile?.ball ?? null}
            tagline={profile?.tagline ?? null}
            favoriteGame={profile?.favorite_game ?? null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionLabel>Your name</SectionLabel>
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
          <SectionLabel>Account</SectionLabel>
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

      <Card>
        <CardHeader>
          <SectionLabel>On your phone</SectionLabel>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="text-muted-foreground">
            Add SECBL to your home screen for a full-screen app, or print a QR card for club night.
          </p>
          <Button asChild variant="outline" className="self-start">
            <Link href="/install">Install &amp; share</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Moved out of the header when it slimmed down to the avatar chip. */}
      <form action={logout}>
        <Button variant="outline" className="text-destructive w-full">
          Log out
        </Button>
      </form>
      </div>
    </main>
  );
}
