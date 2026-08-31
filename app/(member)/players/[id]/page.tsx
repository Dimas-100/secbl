import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, rating, matches_played, created_at, schools(name, short_name)")
    .eq("id", id)
    .single();
  if (!profile) notFound();
  const school = Array.isArray(profile.schools) ? profile.schools[0] : profile.schools;

  const { data: history } = await supabase
    .from("rating_history")
    .select("id, rating_before, rating_after, created_at")
    .eq("profile_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: matches } = await supabase
    .from("matches")
    .select(
      "id, reporter_score, opponent_score, played_at, winner_id, reporter:profiles!matches_reporter_id_fkey(id, display_name), opponent:profiles!matches_opponent_id_fkey(id, display_name)"
    )
    .eq("status", "confirmed")
    .or(`reporter_id.eq.${id},opponent_id.eq.${id}`)
    .order("confirmed_at", { ascending: false })
    .limit(10);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">{profile.display_name}</h1>
        <Badge variant="secondary">{school?.short_name}</Badge>
      </div>

      <Card>
        <CardContent className="flex items-baseline justify-between pt-6">
          <span className="text-4xl font-bold">{profile.rating}</span>
          <span className="text-sm text-muted-foreground">
            {profile.matches_played} matches
            {profile.matches_played < 10 && " · provisional"}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent matches</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {(matches ?? []).length === 0 && (
            <p className="text-muted-foreground">No confirmed matches yet.</p>
          )}
          {(matches ?? []).map((m) => {
            const reporter = Array.isArray(m.reporter) ? m.reporter[0] : m.reporter;
            const opponent = Array.isArray(m.opponent) ? m.opponent[0] : m.opponent;
            const won = m.winner_id === id;
            const other = reporter?.id === id ? opponent : reporter;
            return (
              <p key={m.id}>
                <span className={won ? "font-medium" : "text-muted-foreground"}>
                  {won ? "W" : "L"}
                </span>{" "}
                vs {other?.display_name} {Math.max(m.reporter_score, m.opponent_score)}–
                {Math.min(m.reporter_score, m.opponent_score)}{" "}
                <span className="text-muted-foreground">({m.played_at})</span>
              </p>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rating history</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          {(history ?? []).length === 0 && (
            <p className="text-muted-foreground">No rated matches yet.</p>
          )}
          {(history ?? []).map((h) => {
            const delta = h.rating_after - h.rating_before;
            return (
              <p key={h.id}>
                {h.rating_before} → <span className="font-medium">{h.rating_after}</span>{" "}
                <span className={delta >= 0 ? "text-muted-foreground" : "text-destructive"}>
                  ({delta >= 0 ? "+" : ""}
                  {delta})
                </span>
              </p>
            );
          })}
        </CardContent>
      </Card>
    </main>
  );
}
