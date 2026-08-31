import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { confirmMatch, rejectMatch } from "@/app/(member)/matches/actions";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const { message, error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: me } = await supabase
    .from("profiles")
    .select("display_name, rating, matches_played")
    .eq("id", user!.id)
    .single();

  const { data: toConfirm } = await supabase
    .from("matches")
    .select(
      "id, reporter_score, opponent_score, game_type, played_at, winner_id, reporter:profiles!matches_reporter_id_fkey(id, display_name)"
    )
    .eq("opponent_id", user!.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const { data: recent } = await supabase
    .from("matches")
    .select(
      "id, reporter_score, opponent_score, played_at, winner_id, reporter:profiles!matches_reporter_id_fkey(id, display_name), opponent:profiles!matches_opponent_id_fkey(id, display_name)"
    )
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: false })
    .limit(10);

  return (
    <main className="flex flex-col gap-6">
      {message && <p className="rounded-md bg-muted p-3 text-sm">{message}</p>}
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your rating</CardTitle>
        </CardHeader>
        <CardContent className="flex items-baseline justify-between">
          <span className="text-4xl font-bold">{me?.rating}</span>
          <span className="text-sm text-muted-foreground">
            {me?.matches_played} match{me?.matches_played === 1 ? "" : "es"} played
            {(me?.matches_played ?? 0) < 10 && " · provisional"}
          </span>
        </CardContent>
      </Card>

      {(toConfirm ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Confirm results</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {(toConfirm ?? []).map((m) => {
              const reporter = Array.isArray(m.reporter) ? m.reporter[0] : m.reporter;
              const theyWon = m.winner_id === reporter?.id;
              return (
                <div key={m.id} className="flex items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-medium">{reporter?.display_name}</span> reported{" "}
                    {theyWon ? "beating you" : "losing to you"} {m.reporter_score}–
                    {m.opponent_score} <Badge variant="secondary">{m.game_type}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <form action={confirmMatch}>
                      <input type="hidden" name="match_id" value={m.id} />
                      <Button size="sm" type="submit">
                        Confirm
                      </Button>
                    </form>
                    <form action={rejectMatch}>
                      <input type="hidden" name="match_id" value={m.id} />
                      <Button size="sm" variant="outline" type="submit">
                        Reject
                      </Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent matches</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {(recent ?? []).length === 0 && (
            <p className="text-muted-foreground">
              No confirmed matches yet.{" "}
              <Link href="/matches/new" className="underline">
                Report the first one.
              </Link>
            </p>
          )}
          {(recent ?? []).map((m) => {
            const reporter = Array.isArray(m.reporter) ? m.reporter[0] : m.reporter;
            const opponent = Array.isArray(m.opponent) ? m.opponent[0] : m.opponent;
            const winner = m.winner_id === reporter?.id ? reporter : opponent;
            const loser = m.winner_id === reporter?.id ? opponent : reporter;
            return (
              <p key={m.id}>
                <span className="font-medium">{winner?.display_name}</span> def.{" "}
                {loser?.display_name} {Math.max(m.reporter_score, m.opponent_score)}–
                {Math.min(m.reporter_score, m.opponent_score)}{" "}
                <span className="text-muted-foreground">({m.played_at})</span>
              </p>
            );
          })}
        </CardContent>
      </Card>
    </main>
  );
}
