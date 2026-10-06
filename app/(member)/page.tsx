import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HeroBand } from "@/components/hero-band";
import { MatchRow } from "@/components/match-row";
import { SectionLabel } from "@/components/section-label";
import { Sparkline } from "@/components/sparkline";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { createClient } from "@/lib/supabase/server";
import { confirmMatch, rejectMatch } from "@/app/(member)/matches/actions";
import { clubDateOf, formatEventWhen, partitionEvents, tallyRsvps } from "@/lib/events";
import { formStrip, winnerDelta } from "@/lib/form";
import { GAME_LABEL, greetingFor } from "@/lib/identity";
import {
  currentStreak,
  groupByPlayedDate,
  ratingChangeSince,
  winRate,
  type StatMatch,
} from "@/lib/stats";
import { cn } from "@/lib/utils";
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

  const now = new Date();
  const nowIso = now.toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

  const [
    { data: me },
    { data: board },
    { data: history },
    { data: myMatches },
    { data: toConfirm },
    { data: awaiting },
    { data: recent },
    { data: scheduledEvents },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, rating, matches_played, schools(short_name)")
      .eq("id", user.id)
      .single(),
    // Rank, wins and losses come from the same view the leaderboard renders,
    // so the hero can never disagree with the Ranks tab.
    supabase.from("leaderboard").select("id, school_short_name, wins, losses"),
    supabase
      .from("rating_history")
      .select("rating_before, rating_after, created_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("matches")
      .select("id, reporter_id, opponent_id, winner_id, reporter_score, opponent_score, confirmed_at")
      .eq("status", "confirmed")
      .or(`reporter_id.eq.${user.id},opponent_id.eq.${user.id}`)
      .order("confirmed_at", { ascending: false })
      .limit(10),
    supabase
      .from("matches")
      .select(
        "id, reporter_score, opponent_score, game_type, played_at, winner_id, reporter:profiles!matches_reporter_id_fkey(id, display_name)"
      )
      .eq("opponent_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("matches")
      .select("id, opponent:profiles!matches_opponent_id_fkey(display_name)")
      .eq("reporter_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("matches")
      .select(
        "id, reporter_id, reporter_score, opponent_score, game_type, played_at, winner_id, rating_delta_reporter, rating_delta_opponent, reporter:profiles!matches_reporter_id_fkey(id, display_name, avatar_url, ball), opponent:profiles!matches_opponent_id_fkey(id, display_name, avatar_url, ball)"
      )
      .eq("status", "confirmed")
      .order("played_at", { ascending: false })
      .order("confirmed_at", { ascending: false })
      .limit(15),
    // Bound the fetch, but let partitionEvents make the actual upcoming/past
    // call so the home card and the calendar can never disagree.
    supabase
      .from("events")
      .select("id, title, location, starts_at, ends_at, rsvps(profile_id, response)")
      .eq("status", "scheduled")
      .or(`ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${nowIso})`)
      .order("starts_at")
      .limit(5),
  ]);

  const mySchool = Array.isArray(me?.schools) ? me.schools[0] : me?.schools;
  const rating = me?.rating ?? 450;
  const played = me?.matches_played ?? 0;
  const provisional = played < 10;

  const schoolRows = (board ?? []).filter((r) => r.school_short_name === mySchool?.short_name);
  const schoolRank = schoolRows.findIndex((r) => r.id === user.id) + 1;
  const myRow = (board ?? []).find((r) => r.id === user.id);
  const wins = Number(myRow?.wins ?? 0);
  const losses = Number(myRow?.losses ?? 0);
  const rate = winRate(wins, losses);

  const chronological = [...(history ?? [])].reverse();
  const ratings =
    chronological.length > 0
      ? [chronological[0].rating_before, ...chronological.map((h) => h.rating_after)]
      : [rating];
  const change = ratingChangeSince(history ?? [], monthAgo, rating);
  const streak = currentStreak((myMatches ?? []) as StatMatch[], user.id);
  const form = formStrip((myMatches ?? []).slice(0, 5), user.id);

  const nextEvent = partitionEvents(scheduledEvents ?? [], now).upcoming[0] ?? null;
  const feed = groupByPlayedDate(recent ?? [], clubDateOf(nowIso));

  return (
    <main>
      <HeroBand title={greetingFor(now, me?.display_name ?? "")}>
        <span className="mt-2 block text-[11px] font-bold tracking-[0.12em] text-white/70 uppercase">
          Your rating
        </span>
        <div className="mt-1 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="stat-number text-gold text-[52px] leading-none">{rating}</span>
              {change !== null && (
                <span
                  className={cn(
                    "stat-number text-sm",
                    change >= 0 ? "text-gold" : "text-white/80"
                  )}
                >
                  {change >= 0 ? "▲" : "▼"} {Math.abs(change)}
                  <span className="ml-1 font-medium text-white/60">this month</span>
                </span>
              )}
            </div>
            <div className="mt-1 text-[11px] text-white/60">
              {schoolRank > 0 && mySchool ? `#${schoolRank} at ${mySchool.short_name}` : "Unranked"}
              {" · "}
              {played} played{provisional && " · provisional"}
            </div>
          </div>
          {/* The one memorable element: your line, drawing itself once. */}
          <Sparkline ratings={ratings} className="text-gold shrink-0" />
        </div>
        {form.length > 0 && (
          <div
            className="mt-3 flex items-center gap-2"
            aria-label={`Recent form: ${form.map((f) => (f.won ? "win" : "loss")).join(", ")}`}
          >
            <span className="text-[10px] font-bold tracking-[0.12em] text-white/60 uppercase">
              Form
            </span>
            <span className="flex gap-1">
              {form.map((f) => (
                <span
                  key={f.id}
                  className={cn(
                    "stat-number flex size-6 items-center justify-center rounded-full text-[11px]",
                    f.won ? "bg-gold text-gold-foreground" : "bg-white/15 text-white/70"
                  )}
                >
                  {f.won ? "W" : "L"}
                </span>
              ))}
            </span>
          </div>
        )}
      </HeroBand>

      <div className="-mt-3 flex flex-col gap-4">
        <StatGrid>
          <StatTile label="Record" value={`${wins}–${losses}`} />
          <StatTile label="Win rate" value={rate === null ? "–" : `${rate}%`} />
          <StatTile
            label="Streak"
            value={streak ? `${streak.kind}${streak.length}` : "–"}
            tone={streak ? (streak.kind === "W" ? "win" : "loss") : "default"}
          />
          <StatTile
            label="Rank"
            value={schoolRank > 0 ? `#${schoolRank}` : "–"}
            note={mySchool ? `at ${mySchool.short_name}` : undefined}
          />
        </StatGrid>

        {message && (
          <p className="rounded-md bg-card p-3 text-sm shadow-[var(--shadow-card)]">{message}</p>
        )}
        {error && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

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
                      <Badge variant="secondary">{GAME_LABEL[m.game_type] ?? m.game_type}</Badge>
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

        {(awaiting ?? []).length > 0 && (
          <Card>
            <CardHeader>
              <SectionLabel>Waiting on confirmation</SectionLabel>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              {(awaiting ?? []).map((m) => {
                const opponent = Array.isArray(m.opponent) ? m.opponent[0] : m.opponent;
                return (
                  <p key={m.id} className="text-muted-foreground">
                    <span className="text-foreground font-semibold">{opponent?.display_name}</span>{" "}
                    hasn&apos;t confirmed your report yet.
                  </p>
                );
              })}
            </CardContent>
          </Card>
        )}

        {nextEvent &&
          (() => {
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

        <Card>
          <CardHeader>
            <SectionLabel>League feed</SectionLabel>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {feed.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <span className="text-4xl">🎱</span>
                <p className="text-sm font-semibold">No results yet this season.</p>
                <Button asChild variant="hero" size="sm">
                  <Link href="/matches/new">Report the first match</Link>
                </Button>
              </div>
            )}
            {feed.map((group) => (
              <div key={group.date}>
                <div className="text-muted-foreground mb-1 text-xs font-semibold">{group.label}</div>
                <div className="divide-border/60 flex flex-col divide-y">
                  {group.matches.map((m) => {
                    const reporter = Array.isArray(m.reporter) ? m.reporter[0] : m.reporter;
                    const opponent = Array.isArray(m.opponent) ? m.opponent[0] : m.opponent;
                    const reporterWon = m.winner_id === reporter?.id;
                    return (
                      <MatchRow
                        key={m.id}
                        winner={reporterWon ? reporter : opponent}
                        loser={reporterWon ? opponent : reporter}
                        winnerScore={Math.max(m.reporter_score, m.opponent_score)}
                        loserScore={Math.min(m.reporter_score, m.opponent_score)}
                        delta={winnerDelta(m)}
                        viewerId={user.id}
                        gameType={GAME_LABEL[m.game_type] ?? m.game_type}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
