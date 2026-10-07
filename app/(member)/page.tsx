import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Avatar, type AvatarIdentity } from "@/components/avatar";
import { AvatarStack } from "@/components/avatar-stack";
import { ActivityRow } from "@/components/activity-row";
import { ListRow } from "@/components/list-row";
import { LiveGameCard } from "@/components/live-game-card";
import { LiveHome } from "@/components/live-home";
import { MessagesButton } from "@/components/messages-button";
import { NotifyPrompt } from "@/components/notify-prompt";
import { SectionHeading } from "@/components/section-heading";
import { ShowMore } from "@/components/show-more";
import { Sparkline } from "@/components/sparkline";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { TitleBadge } from "@/components/title-badge";
import { createClient } from "@/lib/supabase/server";
import { confirmMatch, rejectMatch } from "@/app/(member)/matches/actions";
import { clubDateOf, formatEventWhen, partitionEvents, tallyRsvps } from "@/lib/events";
import { FEED_SELECT, one, type FeedPerson, type FeedRow } from "@/lib/feed";
import { LIVE_STALE_MS } from "@/lib/live";
import { GAME_LABEL, greetingFor } from "@/lib/identity";
import { xpCaption } from "@/lib/levels";
import { formatLabel } from "@/lib/race";
import { seasonCountdownLabel } from "@/lib/season";
import { loadOpenSeason, loadSeasonStandings } from "@/lib/season-data";
import { overallRank, ratingChangeSince, seasonLabel, winRate } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { loadXp } from "@/lib/xp-data";
import type { RsvpResponse } from "@/lib/types";

type NextRsvp = {
  profile_id: string;
  response: RsvpResponse;
  profile: AvatarIdentity | AvatarIdentity[] | null;
};

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
    { data: toConfirm },
    { data: awaiting },
    { data: feed },
    { data: scheduledEvents },
    { xp, level },
    openSeason,
    { data: liveRows },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, rating, matches_played, avatar_url, ball")
      .eq("id", user.id)
      .single(),
    // Rank, wins and losses come from the same view the leaderboard renders,
    // so the home block can never disagree with the Ranks tab.
    supabase.from("leaderboard").select("id, wins, losses"),
    supabase
      .from("rating_history")
      .select("rating_before, rating_after, created_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("matches")
      .select(
        "id, reporter_score, opponent_score, game_type, played_at, winner_id, race_to, spot, spot_to, reporter:profiles!matches_reporter_id_fkey(id, display_name, avatar_url, ball)"
      )
      .eq("opponent_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("matches")
      .select("id, opponent:profiles!matches_opponent_id_fkey(id, display_name, avatar_url, ball)")
      .eq("reporter_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    // The league feed: results, badges, streaks, passes, cups, seasons, joins.
    supabase.from("activity").select(FEED_SELECT).order("created_at", { ascending: false }).limit(30),
    // Bound the fetch, but let partitionEvents make the actual upcoming/past
    // call so the home card and the calendar can never disagree.
    supabase
      .from("events")
      .select(
        "id, title, location, starts_at, ends_at, rsvps(profile_id, response, profile:profiles(id, display_name, avatar_url, ball))"
      )
      .eq("status", "scheduled")
      .or(`ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${nowIso})`)
      .order("starts_at")
      .limit(5),
    loadXp(supabase, user.id),
    loadOpenSeason(supabase),
    // Tables being played right now; a board nobody touched for three hours is not.
    supabase
      .from("live_games")
      .select(
        "reporter_id, opponent_id, game_type, race_to, spot, spot_to, reporter_score, opponent_score, updated_at, reporter:profiles!live_games_reporter_id_fkey(id, display_name, avatar_url, ball), opponent:profiles!live_games_opponent_id_fkey(id, display_name, avatar_url, ball)"
      )
      .gte("updated_at", new Date(now.getTime() - LIVE_STALE_MS).toISOString())
      .order("updated_at", { ascending: false }),
  ]);
  const live = (liveRows ?? []).map((g) => ({
    ...g,
    reporter: one(g.reporter as FeedPerson | FeedPerson[] | null),
    opponent: one(g.opponent as FeedPerson | FeedPerson[] | null),
  }));
  // Your place in the running season, for the strip under the stats.
  const mine = openSeason ? (await loadSeasonStandings(supabase, openSeason)).find((s) => s.id === user.id) ?? null : null;

  const rating = me?.rating ?? 450;
  const played = me?.matches_played ?? 0;
  const provisional = played < 10;

  const myRow = (board ?? []).find((r) => r.id === user.id);
  const wins = Number(myRow?.wins ?? 0);
  const losses = Number(myRow?.losses ?? 0);
  const rate = winRate(wins, losses);
  const rank = overallRank(board ?? [], user.id);

  const chronological = [...(history ?? [])].reverse();
  const ratings =
    chronological.length > 0
      ? [chronological[0].rating_before, ...chronological.map((h) => h.rating_after)]
      : [rating];
  const change = ratingChangeSince(history ?? [], monthAgo, rating);

  const today = clubDateOf(nowIso);
  const greeting = greetingFor(now, me?.display_name ?? "").split(",")[0];
  const first = (me?.display_name ?? "").trim().split(/\s+/)[0] || "there";

  const nextEvent = partitionEvents(scheduledEvents ?? [], now).upcoming[0] ?? null;
  const nextRsvps = (nextEvent?.rsvps ?? []) as NextRsvp[];
  const myResponse = nextEvent ? tallyRsvps(nextRsvps, user.id).mine : null;
  const going = nextRsvps
    .filter((r) => r.response === "going")
    .map((r) => (Array.isArray(r.profile) ? r.profile[0] : r.profile))
    .filter((p): p is AvatarIdentity => !!p);
  const others = going.filter((p) => p.id !== user.id).length;
  const goingCaption =
    myResponse === "going"
      ? others > 0
        ? `You + ${others} going`
        : "You're going"
      : `${going.length} going`;

  return (
    <main className="flex flex-col gap-9 pt-3">
      <h1 className="sr-only">Home</h1>
      <header className="flex items-center justify-between gap-3">
        <Link href={`/players/${user.id}`} aria-label="Your profile" className="press flex items-center gap-3">
          <Avatar
            person={{ id: user.id, display_name: me?.display_name, avatar_url: me?.avatar_url, ball: me?.ball }}
            size="lg"
          />
          <span className="flex flex-col gap-px">
            <span className="text-muted-foreground text-[12px]">{greeting}</span>
            <span className="flex items-center gap-1.5 text-[16px] font-medium">
              {first}
              <TitleBadge title={level.title} size={20} />
            </span>
          </span>
        </Link>
        <MessagesButton />
      </header>

      {message && <p className="bg-card rounded-2xl p-3 text-sm">{message}</p>}
      {error && <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>}
      <NotifyPrompt />
      <LiveHome />

      {live.length > 0 && (
        <section className="flex flex-col gap-3">
          <span className="eyebrow flex items-center gap-2">
            <span aria-hidden="true" className="bg-win motion-safe:animate-pulse size-2 rounded-full" />
            Live now
          </span>
          {live.map((g) => (
            <LiveGameCard key={g.reporter_id} row={g} viewerId={user.id} />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-[18px]">
        <span className="eyebrow">Rating · {openSeason?.name ?? seasonLabel(today)}</span>
        <div className="flex items-end justify-between gap-4">
          <span className="hero-number">{rating}</span>
          {change !== null && (
            <span className={cn("stat-number pb-1.5 text-[13px]", change >= 0 ? "text-win" : "text-loss")}>
              {change >= 0 ? "+" : "−"}
              {Math.abs(change)} this month
            </span>
          )}
        </div>
        <Sparkline ratings={ratings} />
        <StatGrid cols={3}>
          <StatTile label="Overall rank" value={rank ? `#${rank}` : "–"} />
          <StatTile
            label="Win rate"
            value={rate === null ? "–" : `${rate}%`}
            note={`${wins}–${losses}${provisional ? " · provisional" : ""}`}
          />
          <StatTile
            label={`Level · ${level.title}`}
            value={`Lvl ${level.level}`}
            note={`${Math.round((level.intoLevel / level.needed) * 100)}% to ${level.level + 1}`}
          />
        </StatGrid>
        {openSeason && mine && (
          <Link
            href="/leaderboard?tab=season"
            className="press bg-card flex items-center justify-between gap-3 rounded-[20px] px-5 py-4 shadow-[inset_0_0_0_1px_var(--hairline-row)]"
          >
            <span className="flex min-w-0 flex-col gap-1.5">
              <span className="eyebrow">{openSeason.name}</span>
              <span className="stat-number text-[20px] leading-none">
                {mine.played > 0 ? `#${mine.rank} · ${mine.points} pts` : "No games yet"}
              </span>
            </span>
            <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-[12px]">
              {seasonCountdownLabel(openSeason, today)}
              <ChevronRight className="size-4" strokeWidth={1.7} />
            </span>
          </Link>
        )}
      </section>

      {(toConfirm ?? []).length > 0 && (
        <section className="flex flex-col gap-1.5">
          <SectionHeading>Confirm results</SectionHeading>
          {(toConfirm ?? []).map((m) => {
            const reporter = Array.isArray(m.reporter) ? m.reporter[0] : m.reporter;
            const theyWon = m.winner_id === reporter?.id;
            return (
              <ListRow
                key={m.id}
                leading={<Avatar person={reporter ?? { id: "unknown", display_name: null }} size="md" />}
                title={
                  <>
                    {reporter?.display_name ?? "Member"} · {theyWon ? "beat you" : "lost to you"}{" "}
                    <span className="stat-number">
                      {m.reporter_score}–{m.opponent_score}
                    </span>
                  </>
                }
                meta={[
                  GAME_LABEL[m.game_type] ?? m.game_type,
                  formatLabel(
                    m.race_to,
                    m.spot,
                    m.spot_to === user.id ? "you" : (reporter?.display_name ?? "them").split(" ")[0]
                  ),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                trailing={
                  <span className="flex items-center gap-4 text-[13px]">
                    <form action={rejectMatch}>
                      <input type="hidden" name="match_id" value={m.id} />
                      <button type="submit" className="text-muted-foreground press">
                        Reject
                      </button>
                    </form>
                    <form action={confirmMatch}>
                      <input type="hidden" name="match_id" value={m.id} />
                      <button type="submit" className="text-brass press font-medium">
                        Confirm
                      </button>
                    </form>
                  </span>
                }
              />
            );
          })}
        </section>
      )}

      {(awaiting ?? []).length > 0 && (
        <section className="flex flex-col gap-1.5">
          <SectionHeading>Waiting on</SectionHeading>
          {(awaiting ?? []).map((m) => {
            const opponent = Array.isArray(m.opponent) ? m.opponent[0] : m.opponent;
            return (
              <ListRow
                key={m.id}
                leading={<Avatar person={opponent ?? { id: "unknown", display_name: null }} size="md" />}
                title={opponent?.display_name ?? "Member"}
                meta="Hasn't confirmed your report yet"
              />
            );
          })}
        </section>
      )}

      {nextEvent && (
        <section className="flex flex-col gap-3.5">
          <SectionHeading action={{ href: "/events", label: "Calendar" }}>Next match</SectionHeading>
          <Link
            href={`/events/${nextEvent.id}`}
            className="press bg-card flex flex-col gap-[18px] rounded-[20px] p-5 shadow-[inset_0_0_0_1px_var(--hairline-row)]"
          >
            <div className="flex flex-col gap-1.5">
              <span className="text-brass text-[12px] tracking-[0.06em] uppercase">
                {formatEventWhen(nextEvent.starts_at, nextEvent.ends_at)}
              </span>
              <span className="text-[18px] font-medium">{nextEvent.title}</span>
              {nextEvent.location && (
                <span className="text-muted-foreground text-[13px]">{nextEvent.location}</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-3">
              <AvatarStack people={going} caption={goingCaption} />
              <span
                className={cn(
                  "shrink-0 text-[12px] font-medium",
                  myResponse === "going" ? "text-win" : "text-brass"
                )}
              >
                {myResponse === "going" ? "Attending" : myResponse === "maybe" ? "Maybe" : "RSVP"}
              </span>
            </div>
          </Link>
        </section>
      )}

      <section className="flex flex-col gap-1.5">
        <SectionHeading action={{ href: `/players/${user.id}`, label: "All games" }}>Recent</SectionHeading>
        {(feed ?? []).length === 0 && (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No results yet this season.{" "}
            <Link href="/matches/new" className="text-brass">
              Log the first game.
            </Link>
          </p>
        )}
        <ShowMore
          label="Show {hidden} more"
          items={((feed ?? []) as unknown as FeedRow[]).map((row) => (
            <ActivityRow
              key={row.id}
              row={row}
              viewerId={user.id}
              today={today}
              now={now}
              caption={row.match_id ? xpCaption(row.match_id, xp) : undefined}
            />
          ))}
        />
      </section>
    </main>
  );
}
