import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HeroBand } from "@/components/hero-band";
import { SectionLabel } from "@/components/section-label";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import { startDm } from "@/app/(member)/chat/actions";

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    <main>
      <HeroBand
        title={
          <span className="flex items-center gap-2">
            {profile.display_name}
            <Badge variant="secondary">{school?.short_name}</Badge>
          </span>
        }
      >
        <div className="mt-2 flex items-baseline gap-3">
          <span className="stat-number text-gold text-4xl leading-none">
            {profile.rating}
          </span>
          <span className="text-[11px] text-white/60">
            {profile.matches_played} matches
            {profile.matches_played < 10 && " · provisional"}
          </span>
          {user && user.id !== profile.id && (
            <form action={startDm} className="ml-auto">
              <input type="hidden" name="profile_id" value={profile.id} />
              <SubmitButton size="sm" variant="hero" pendingChildren="Opening…">
                Message
              </SubmitButton>
            </form>
          )}
        </div>
      </HeroBand>

      <div className="-mt-3 flex flex-col gap-4">
      <Card>
        <CardHeader>
          <SectionLabel>Recent matches</SectionLabel>
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
              <div key={m.id} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">
                  <span
                    className={
                      won
                        ? "text-primary font-bold"
                        : "text-muted-foreground font-bold"
                    }
                  >
                    {won ? "W" : "L"}
                  </span>{" "}
                  vs {other?.display_name}{" "}
                  <span className="text-muted-foreground text-xs">({m.played_at})</span>
                </span>
                <span className="stat-number shrink-0">
                  {Math.max(m.reporter_score, m.opponent_score)}–
                  {Math.min(m.reporter_score, m.opponent_score)}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionLabel>Rating history</SectionLabel>
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
      </div>
    </main>
  );
}
