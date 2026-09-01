import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { saveEntrants, startTournament } from "@/app/(member)/tournaments/actions";

export default async function TournamentSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const { error, message } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/tournaments");

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, status")
    .eq("id", id)
    .single();
  if (!tournament) notFound();
  if (tournament.status !== "setup") redirect(`/tournaments/${id}`);

  const { data: candidates } = await supabase
    .from("profiles")
    .select("id, display_name, rating, schools(short_name)")
    .eq("status", "approved")
    .order("rating", { ascending: false });

  const { data: entrants } = await supabase
    .from("tournament_players")
    .select("profile_id")
    .eq("tournament_id", id);
  const chosen = new Set((entrants ?? []).map((e) => e.profile_id as string));

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">{tournament.name}</h1>
      {message && <p className="rounded-md bg-muted p-3 text-sm">{message}</p>}
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      <form action={saveEntrants} className="flex flex-col gap-4">
        <input type="hidden" name="tournament_id" value={id} />
        <Card>
          <CardHeader>
            <CardTitle>Entrants</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs">
              Listed strongest first. Seeds are assigned by rating when you start, so the
              order here does not matter.
            </p>
            {(candidates ?? []).map((c) => {
              const school = Array.isArray(c.schools) ? c.schools[0] : c.schools;
              return (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="profile_ids"
                    value={c.id}
                    defaultChecked={chosen.has(c.id as string)}
                  />
                  <span className="font-medium">{c.display_name}</span>
                  <Badge variant="secondary">{school?.short_name}</Badge>
                  <span className="text-muted-foreground">{c.rating}</span>
                </label>
              );
            })}
          </CardContent>
        </Card>
        <Button type="submit" className="self-start">
          Save entrants
        </Button>
      </form>

      <form action={startTournament}>
        <input type="hidden" name="tournament_id" value={id} />
        <Button type="submit" variant="default">
          Start tournament ({chosen.size} entrants)
        </Button>
        <p className="text-muted-foreground mt-2 text-xs">
          Starting generates the whole bracket and locks the entrant list.
        </p>
      </form>
    </main>
  );
}
