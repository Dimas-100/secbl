import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { EntrantsEditor, type Candidate } from "./entrants-editor";

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

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("id, name, status")
    .eq("id", id)
    .single();
  if (!tournament) {
    // A real lookup failure (not merely "no row") should be visible in logs.
    if (tournamentError && tournamentError.code !== "PGRST116") {
      console.error("tournament setup lookup failed", tournamentError);
    }
    notFound();
  }
  if (tournament.status !== "setup") redirect(`/tournaments/${id}`);

  const [{ data: candidates }, { data: entrants }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, rating, schools(short_name)")
      .eq("status", "approved")
      .order("rating", { ascending: false })
      .order("display_name"),
    supabase.from("tournament_players").select("profile_id, seed").eq("tournament_id", id).order("seed"),
  ]);

  const options: Candidate[] = (candidates ?? []).map((c) => {
    const school = Array.isArray(c.schools) ? c.schools[0] : c.schools;
    return { id: c.id, display_name: c.display_name, rating: c.rating, school: school?.short_name ?? null };
  });
  const seeds = (entrants ?? []).map((e) => e.profile_id as string);

  return (
    <main>
      <PageHeader
        title={tournament.name}
        back="/events?tab=cups"
        trailing={<Badge variant="secondary">Setting up</Badge>}
      />
      <div className="mt-6 flex flex-col gap-6">
        {message && (
          <p className="bg-card rounded-2xl p-3 text-sm shadow-[inset_0_0_0_1px_var(--hairline-row)]">{message}</p>
        )}
        {error && <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>}
        {/* key: a save re-renders with the stored order; the editor restarts from it. */}
        <EntrantsEditor key={seeds.join(",")} tournamentId={id} candidates={options} initialSeeds={seeds} />
      </div>
    </main>
  );
}
