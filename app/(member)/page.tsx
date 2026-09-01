import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HeroBand } from "@/components/hero-band";
import { SectionLabel } from "@/components/section-label";
import { createClient } from "@/lib/supabase/server";
import { confirmMatch, rejectMatch } from "@/app/(member)/matches/actions";
import { formatEventWhen, partitionEvents, tallyRsvps } from "@/lib/events";
import type { RsvpResponse } from "@/lib/types";

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
  // The layout redirects too, but pages render concurrently with layouts.
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("display_name, rating, matches_played, schools(short_name)")
    .eq("id", user.id)
    .single();
  const mySchool = Array.isArray(me?.schools) ? me.schools[0] : me?.schools;

  // Rank comes from the same view the leaderboard renders, so the hero can
  // never disagree with the Ranks tab.
  const { data: board } = await supabase
    .from("leaderboard")
    .select("id, school_short_name");
  const schoolRows = (board ?? []).filter(
    (r) => r.school_short_name === mySchool?.short_name
  );
  const schoolRank = schoolRows.findIndex((r) => r.id === user.id) + 1;

  const { data: toConfirm } = await supabase
    .from("matches")
    .select(
      "id, reporter_score, opponent_score, game_type, played_at, winner_id, reporter:profiles!matches_reporter_id_fkey(id, display_name)"
    )
    .eq("opponent_id", user.id)
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

  const nowIso = new Date().toISOString();
  // Bound the fetch, but let partitionEvents make the actual upcoming/past
  // call so the home card and the calendar can never disagree.
  const { data: scheduledEvents } = await supabase
    .from("events")
    .select("id, title, location, starts_at, ends_at, rsvps(profile_id, response)")
    .eq("status", "scheduled")
    .or(`ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${nowIso})`)
    .order("starts_at")
    .limit(5);
  const nextEvent = partitionEvents(scheduledEvents ?? [], new Date()).upcoming[0] ?? null;

  return (
    <main>
      <HeroBand title="SECBL">
        <div className="mt-2 flex items-baseline gap-3">
          <span className="stat-number text-gold text-5xl leading-none">{me?.rating}</span>
          <div className="text-[11px] leading-tight">
            <div className="font-bold">
              {schoolRank > 0 && mySchool
                ? `#${schoolRank} at ${mySchool.short_name}`
                : "Unranked"}
            </div>
            <div className="text-white/60">
              {me?.matches_played} played
              {(me?.matches_played ?? 0) < 10 && " · provisional"}
            </div>
          </div>
        </div>
      </HeroBand>

      <div className="-mt-3 flex flex-col gap-4">
        {message && <p className="rounded-md bg-card p-3 text-sm shadow-[var(--shadow-card)]">{message}</p>}
        {error && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        {nextEvent && (() => {
          const myResponse = tallyRsvps(
            (nextEvent.rsvps ?? []) as { profile_id: string; response: RsvpResponse }[],
            user.id
          ).mine;
          return (
            <Card>
              <CardHeader>
                <SectionLabel>Next up</SectionLabel>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                <Link
                  href={`/events/${nextEvent.id}`}
                  className="font-semibold underline-offset-2 hover:underline"
                >
                  {nextEvent.title}
                </Link>
                <span className="text-muted-foreground">
                  {formatEventWhen(nextEvent.starts_at, nextEvent.ends_at)}
                  {nextEvent.location && ` · ${nextEvent.location}`}
                </span>
                <span className="text-muted-foreground text-xs">
                  {myResponse ? `You're ${myResponse}` : "You haven't RSVP'd"}
                </span>
              </CardContent>
            </Card>
          );
        })()}

        {(toConfirm ?? []).length > 0 && (
          <Card>
            <CardHeader>
              <SectionLabel>Confirm results</SectionLabel>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {(toConfirm ?? []).map((m) => {
                const reporter = Array.isArray(m.reporter) ? m.reporter[0] : m.reporter;
                const theyWon = m.winner_id === reporter?.id;
                return (
                  <div key={m.id} className="flex flex-col gap-2">
                    <div className="text-sm">
                      <span className="font-semibold">{reporter?.display_name}</span> reported{" "}
                      {theyWon ? "beating you" : "losing to you"}{" "}
                      <span className="stat-number">
                        {m.reporter_score}–{m.opponent_score}
                      </span>{" "}
                      <Badge variant="secondary">{m.game_type}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <form action={confirmMatch} className="contents">
                        <input type="hidden" name="match_id" value={m.id} />
                        <Button type="submit">Confirm</Button>
                      </form>
                      <form action={rejectMatch} className="contents">
                        <input type="hidden" name="match_id" value={m.id} />
                        <Button variant="outline" type="submit">
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
            <SectionLabel>Recent matches</SectionLabel>
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
                <div key={m.id} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{winner?.display_name}</span> def.{" "}
                    {loser?.display_name}{" "}
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
      </div>
    </main>
  );
}
