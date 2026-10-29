import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Avatar, type AvatarIdentity } from "@/components/avatar";
import { AvatarStack } from "@/components/avatar-stack";
import { CharacterNudge } from "@/components/character-nudge";
import { ActivityRow, RecapRow } from "@/components/activity-row";
import { FirstGameCard, type FirstGameFace } from "@/components/first-game-card";
import { GameCountsScreen, type GameCountsProps } from "@/components/game-counts-screen";
import { ListRow } from "@/components/list-row";
import { LiveGameCard } from "@/components/live-game-card";
import { LiveHome } from "@/components/live-home";
import { MessagesButton } from "@/components/messages-button";
import { NightCard } from "@/components/night-card";
import { loadNight } from "@/lib/night-data";
import { NotifyPrompt } from "@/components/notify-prompt";
import { ProgressCard } from "@/components/progress-card";
import { ResumeGameCard } from "@/components/resume-game-card";
import { SectionHeading } from "@/components/section-heading";
import { ShowMore } from "@/components/show-more";
import { StreakFlame } from "@/components/streak-flame";
import { SubmitButton } from "@/components/submit-button";
import { TitleBadge } from "@/components/title-badge";
import { createClient } from "@/lib/supabase/server";
import { confirmMatch, disputeAgreedMatch, rejectMatch } from "@/app/(member)/matches/actions";
import { AGREED_WINDOW_MS, canFlag, flagDeadlineLabel } from "@/lib/agreed";
import { talkSummary, type LiveComment } from "@/lib/table-talk";
import { earnedAchievements } from "@/lib/achievements";
import { freshMatch } from "@/lib/celebration";
import { clubDateOf, clubMonthStart, formatEventWhen, partitionEvents, tallyRsvps } from "@/lib/events";
import { FEED_SELECT, RECENT_KINDS, mergeRecent, one, schoolOf, type FeedPerson, type FeedRow } from "@/lib/feed";
import { confirmMeta, facesEyebrow, firstName, formDots, nextLine, playedFrom, xpNote } from "@/lib/home";
import { LIVE_SHOWN, LIVE_STALE_MS, orderLiveGames } from "@/lib/live";
import { charactersEnabled } from "@/lib/character";
import { GAME_LABEL, ballFor, greetingFor } from "@/lib/identity";
import { levelFromXp, nextBadge } from "@/lib/levels";
import { myNightStatus } from "@/lib/night";
import { fetchAllPages } from "@/lib/paging";
import { playFaces } from "@/lib/play";
import { formatShort } from "@/lib/race";
import { loadRecaps } from "@/lib/recent-data";
import { aboveOf, leadOf, toRankRow, type RankRow } from "@/lib/ranking";
import { firstWinOver, gameRankMove, momentLines, rematchHref, resultHeadline, secondAction } from "@/lib/result-moment";
import { seasonCountdownLabel, seasonStrip } from "@/lib/season";
import { loadOpenSeason, loadSeasonStandings } from "@/lib/season-data";
import { byPlayOrder, currentStreak, ratingChangeSince, type PlayOrdered, type StatMatch } from "@/lib/stats";
import { cn, GOLD_EDGE } from "@/lib/utils";
import { gameSplits, type YouMatch } from "@/lib/you";
import { loadXp } from "@/lib/xp-data";
import type { RsvpResponse } from "@/lib/types";

type NextRsvp = {
  profile_id: string;
  response: RsvpResponse;
  profile: AvatarIdentity | AvatarIdentity[] | null;
};

type RatedRef = { id: string; rating: number };

// How many stored rows Recent fetches.
const FEED_LIMIT = 30;

// One of your confirmed games, for what the newest one changed: the record
// in its game type, a first win over them, the achievements it unlocked.
type MomentMatch = StatMatch &
  YouMatch &
  PlayOrdered & {
    reporter: RatedRef | RatedRef[] | null;
    opponent: RatedRef | RatedRef[] | null;
  };

const MOMENT_COLS =
  "id, reporter_id, opponent_id, winner_id, reporter_score, opponent_score, game_type, played_at, created_at, confirmed_at, reporter:profiles!matches_reporter_id_fkey(id, rating), opponent:profiles!matches_opponent_id_fkey(id, rating)";

// What happened on the ladder after the newest game counted (ruling S4-R5).
type LaterRating = { profile_id: string; rating_before: number; created_at: string };
type LaterGame = { reporter_id: string; opponent_id: string; winner_id: string };

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
  // "This month" is the club calendar month (ruling S2-R4), as on the You page.
  const monthStart = clubMonthStart(now);

  const [
    { data: me },
    { data: board, error: boardError },
    { data: history },
    { data: toConfirm },
    { data: awaiting },
    { data: feed },
    { data: scheduledEvents },
    { xp, level },
    openSeason,
    { data: liveRows },
    { data: myMatches },
    { data: agreedForMe },
    nightData,
    recaps,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, rating, matches_played, avatar_url, ball, school_id, schools(short_name)")
      .eq("id", user.id)
      .single(),
    // Rank, wins and losses come from the same view the leaderboard renders,
    // so the home block can never disagree with the Ranks tab.
    supabase.from("leaderboard").select("id, rating, wins, losses, display_name"),
    // "This month" on the progress card: every rated game since the 1st, not
    // a fixed count, so a busy month still finds its first rating.
    supabase
      .from("rating_history")
      .select("rating_before, rating_after, created_at")
      .eq("profile_id", user.id)
      .gte("created_at", monthStart.toISOString())
      .order("created_at", { ascending: false }),
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
    // The league feed: results, seasons and cups (lib/feed RECENT_KINDS).
    supabase
      .from("activity")
      .select(FEED_SELECT)
      .in("kind", RECENT_KINDS)
      .order("created_at", { ascending: false })
      .limit(FEED_LIMIT),
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
        "id, reporter_id, opponent_id, game_type, race_to, spot, spot_to, reporter_score, opponent_score, updated_at, reporter:profiles!live_games_reporter_id_fkey(id, display_name, avatar_url, ball, schools(short_name)), opponent:profiles!live_games_opponent_id_fkey(id, display_name, avatar_url, ball, schools(short_name))"
      )
      .gte("updated_at", new Date(now.getTime() - LIVE_STALE_MS).toISOString())
      .order("updated_at", { ascending: false }),
    // Your newest confirmed games: the streak flame, the form dots and the
    // game-counts screen.
    supabase
      .from("matches")
      .select(
        "id, reporter_id, opponent_id, winner_id, reporter_score, opponent_score, game_type, race_to, spot, confirmed_at, played_at, created_at, reporter:profiles!matches_reporter_id_fkey(id, display_name, avatar_url, ball), opponent:profiles!matches_opponent_id_fkey(id, display_name, avatar_url, ball)"
      )
      .eq("status", "confirmed")
      .or(`reporter_id.eq.${user.id},opponent_id.eq.${user.id}`)
      .order("confirmed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(30),
    // Games the other player counted on the spot that you can still flag.
    supabase
      .from("matches")
      .select(
        "id, status, agreed_at, confirmed_at, opponent_id, reporter_score, opponent_score, game_type, winner_id, race_to, spot, spot_to, reporter:profiles!matches_reporter_id_fkey(id, display_name, avatar_url, ball)"
      )
      .eq("opponent_id", user.id)
      .eq("status", "confirmed")
      .not("agreed_at", "is", null)
      .gte("confirmed_at", new Date(now.getTime() - AGREED_WINDOW_MS).toISOString())
      .order("confirmed_at", { ascending: false }),
    // Tonight's club night at your school, if one is on.
    loadNight(supabase, user.id, now),
    // Calendar events and club nights that ended this past month, for Recent.
    loadRecaps(supabase, now),
  ]);
  const flaggable = (agreedForMe ?? []).filter((m) => canFlag(m, user.id, now));
  // Called to a table tonight: that card joins what needs you at the top; out
  // of the line or waiting in it, the night stays further down.
  const nightStatus = myNightStatus(nightData.night, nightData.line, nightData.tables, user.id, now);
  const atTable = nightStatus.kind === "playing";
  // Newest confirmed first: the game-counts screen is the game that just counted.
  const mine30 = (myMatches ?? []) as (StatMatch &
    PlayOrdered & { game_type: string; race_to: number | null; spot: number; reporter: unknown; opponent: unknown })[];
  // The same games as they were played (ruling S3-R7): the flame and the dots
  // read "the last N", so a batch confirmed out of order can't misstate them.
  const mineByPlay = [...mine30].sort(byPlayOrder);
  const streak = currentStreak(mineByPlay, user.id);
  const streakLength = streak?.kind === "W" ? streak.length : 0;
  const feedRows = (feed ?? []) as unknown as FeedRow[];
  const recent = mergeRecent(feedRows, recaps, FEED_LIMIT);

  const mySchool = one(me?.schools as { short_name: string } | { short_name: string }[] | null)?.short_name ?? null;
  const live = orderLiveGames(
    (liveRows ?? []).map((g) => {
      const reporter = one(g.reporter as FeedPerson | FeedPerson[] | null);
      const opponent = one(g.opponent as FeedPerson | FeedPerson[] | null);
      return { ...g, reporter, opponent, reporter_school: schoolOf(reporter), opponent_school: schoolOf(opponent) };
    }),
    { meId: user.id, mySchool }
  );
  // Table talk under each live card: the count and the newest line.
  const talkByGame = new Map<string, ReturnType<typeof talkSummary>>();
  if (live.length > 0) {
    const { data: talkRows } = await supabase
      .from("live_comments")
      .select("id, game_id, author_id, body, created_at, author:profiles!live_comments_author_id_fkey(display_name)")
      .in(
        "game_id",
        live.map((g) => g.id as string)
      )
      .order("id", { ascending: true })
      .limit(200);
    const perGame = new Map<string, LiveComment[]>();
    const talkNames: Record<string, string> = {};
    for (const r of talkRows ?? []) {
      perGame.set(r.game_id, [...(perGame.get(r.game_id) ?? []), r as LiveComment]);
      const author = one(r.author as { display_name: string } | { display_name: string }[] | null);
      if (author) talkNames[r.author_id] = author.display_name;
    }
    for (const [gameId, comments] of perGame) talkByGame.set(gameId, talkSummary(comments, talkNames));
  }
  // Games played come from the same view as rank, so placement and the Next
  // line can never disagree with the Ranks tab. If that read fails, the
  // profile's count keeps a veteran off the Step 1 card and the Next line,
  // which needs rank, is left out.
  if (boardError) console.error("home: couldn't read the leaderboard", boardError);
  const rankRows: RankRow[] = (board ?? []).map(toRankRow);
  const { played, rankKnown } = playedFrom(
    rankRows.find((r) => r.id === user.id),
    me?.matches_played
  );
  const boardNames = new Map((board ?? []).map((r) => [String(r.id), String(r.display_name ?? "Member")]));

  // The game-counts screen (spec 2026-10-21-play-and-progress §3): the newest
  // confirmed game in the last day, what it did to the rating and XP, and at
  // most three true lines about what changed.
  const fresh = freshMatch(mine30, now);
  const today = clubDateOf(nowIso);
  // A paged read that throws on a failed page, so a partial list is never
  // counted from: the caller drops what needs it instead.
  function allPages<T>(
    what: string,
    page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>
  ) {
    return fetchAllPages<T>((from, to) =>
      page(from, to).then(({ data, error: readError }) => {
        if (readError) throw new Error(readError.message);
        return (data ?? []) as T[];
      })
    ).catch((err: unknown) => {
      console.error(`home: couldn't read ${what}`, err);
      return null;
    });
  }

  // One more wave, all at once: your place in the running season and who
  // leads it, for the strip under the progress card; for a member with no game
  // yet, the people to play (approved members in the Play sheet's order, with
  // no recent opponents); and, while a game is fresh, the result screen's reads.
  const [strip, members, freshReads] = await Promise.all([
    openSeason ? loadSeasonStandings(supabase, openSeason).then((s) => seasonStrip(s, user.id)) : null,
    played === 0
      ? supabase
          .from("profiles")
          .select("id, display_name, avatar_url, ball, school_id")
          .eq("status", "approved")
          .neq("id", user.id)
          .then(({ data }) => (data ?? []) as (FirstGameFace & { school_id: string | null })[])
      : null,
    fresh
      ? Promise.all([
          // Both players' ratings going in: the ladder before this game.
          supabase.from("rating_history").select("profile_id, rating_before, rating_after").eq("match_id", fresh.id),
          // The badge and streak rows this game wrote for you.
          supabase.from("activity").select("kind, data").eq("match_id", fresh.id).eq("actor_id", user.id),
          // Your best rating before this game (the 500 / 600 club).
          supabase
            .from("rating_history")
            .select("rating_after")
            .eq("profile_id", user.id)
            .or(`match_id.is.null,match_id.neq.${fresh.id}`)
            .order("rating_after", { ascending: false })
            .limit(1)
            .maybeSingle(),
          // Every confirmed game of yours (paged).
          allPages<MomentMatch>("your games for the result screen", (from, to) =>
            supabase
              .from("matches")
              .select(MOMENT_COLS)
              .eq("status", "confirmed")
              .or(`reporter_id.eq.${user.id},opponent_id.eq.${user.id}`)
              .order("id")
              .range(from, to)
          ),
          // Everything that moved the ladder after this game counted (ruling
          // S4-R5): rating changes stamped strictly later (this game's own are
          // stamped with its confirmed_at), and games confirmed strictly later.
          // A day's worth at most, so small.
          allPages<LaterRating>("the ratings since the result", (from, to) =>
            supabase
              .from("rating_history")
              .select("profile_id, rating_before, created_at")
              .gt("created_at", fresh.confirmed_at!)
              .or(`match_id.is.null,match_id.neq.${fresh.id}`)
              .order("id")
              .range(from, to)
          ),
          allPages<LaterGame>("the games since the result", (from, to) =>
            supabase
              .from("matches")
              .select("reporter_id, opponent_id, winner_id")
              .eq("status", "confirmed")
              .gt("confirmed_at", fresh.confirmed_at!)
              .neq("id", fresh.id)
              .order("id")
              .range(from, to)
          ),
        ])
      : null,
  ]);

  let moment: GameCountsProps | null = null;
  if (fresh && freshReads) {
    const opponentId = fresh.reporter_id === user.id ? fresh.opponent_id : fresh.reporter_id;
    const [
      { data: hist, error: histError },
      { data: moments, error: momentsError },
      { data: peakRow, error: peakError },
      allMine,
      laterHistory,
      laterMatches,
    ] = freshReads;
    // A failed read keeps its fallback (no screen without your rating
    // history; no badge, streak or achievement lines), but is never silent.
    if (histError) console.error("home: couldn't read the result's rating history", histError);
    if (momentsError) console.error("home: couldn't read the result's badge and streak rows", momentsError);
    if (peakError) console.error("home: couldn't read your best rating for the result screen", peakError);
    const mine = (hist ?? []).find((h) => h.profile_id === user.id);
    const iReported = fresh.reporter_id === user.id;
    const opponent = one((iReported ? fresh.opponent : fresh.reporter) as FeedPerson | FeedPerson[] | null);
    if (mine && opponent) {
      const won = fresh.winner_id === user.id;
      const opponentFirst = firstName(opponent.display_name);

      // The ladder as it stood the instant this game counted, against it with
      // the game taken back out (rulings S4-R3, S4-R5): what anyone played
      // since is not this game's doing. Without the ladder or what came after
      // it, the rank line is left out rather than guessed.
      const move =
        boardError || !laterHistory || !laterMatches
          ? null
          : gameRankMove({
              today: rankRows,
              laterHistory,
              laterMatches,
              winnerId: fresh.winner_id,
              loserId: won ? opponentId : user.id,
              ratingBefore: new Map((hist ?? []).map((h) => [h.profile_id, h.rating_before])),
              meId: user.id,
              opponentId,
            });

      // Your games as they were played (ruling S3-R7), this one included.
      const byPlay = allMine?.some((m) => m.id === fresh.id) ? [...allMine].sort(byPlayOrder) : null;
      let achievementsUnlocked: string[] = [];
      if (byPlay && !peakError) {
        // With and without this game, everything else as it is now. Cup and
        // season titles are the feed's to announce, so neither side counts them.
        const opponentRatings: Record<string, number> = {};
        for (const m of byPlay) {
          for (const p of [one(m.reporter), one(m.opponent)]) if (p) opponentRatings[p.id] = p.rating;
        }
        const ratingNow = me?.rating ?? mine.rating_after;
        const base = { viewerId: user.id, rating: ratingNow, opponentRatings, tournamentsWon: 0, seasonsWon: 0 };
        const peakWithout = Math.max(peakRow?.rating_after ?? mine.rating_before, mine.rating_before);
        const peakWith = Math.max(peakWithout, mine.rating_after, ratingNow);
        const without = byPlay.filter((m) => m.id !== fresh.id);
        const had = new Set(earnedAchievements({ ...base, peak: peakWithout, matches: without }).map((a) => a.id));
        achievementsUnlocked = earnedAchievements({ ...base, peak: peakWith, matches: byPlay })
          .filter((a) => !had.has(a.id))
          .map((a) => a.label);
      }
      const split = byPlay ? gameSplits(byPlay, user.id).find((s) => s.game === fresh.game_type) : undefined;

      const badgeTitle = (moments ?? []).find((r) => r.kind === "badge")?.data?.title;
      const streakRow = (moments ?? []).find((r) => r.kind === "streak");
      const streakRun = streakRow ? Number((streakRow.data as { length?: number }).length) : NaN;
      const xpEarned = xp.perMatch.get(fresh.id) ?? 0;

      const second = secondAction({
        nightOpen: nightData.night !== null,
        nightOpenedAt: nightData.night?.opened_at ?? null,
        myNightKind: nightStatus.kind,
        confirmedAt: fresh.confirmed_at!,
        playedAt: fresh.played_at,
        today,
      });
      moment = {
        matchId: fresh.id,
        won,
        headline: resultHeadline(
          won,
          opponentFirst,
          iReported ? fresh.reporter_score : fresh.opponent_score,
          iReported ? fresh.opponent_score : fresh.reporter_score
        ),
        sub: [GAME_LABEL[fresh.game_type] ?? fresh.game_type, formatShort(fresh.race_to, fresh.spot)]
          .filter(Boolean)
          .join(" · "),
        ratingBefore: mine.rating_before,
        ratingAfter: mine.rating_after,
        xpEarned,
        xpCapped: xp.capped.has(fresh.id),
        level: level.level,
        intoLevel: level.intoLevel,
        needed: level.needed,
        lines: momentLines({
          move: move && {
            kind: move.kind,
            to: move.to,
            other: move.otherId ? firstName(boardNames.get(move.otherId) ?? "Member") : null,
          },
          // The game is the newest in XP order, so taking its XP off the
          // total is the level before it.
          levelBefore: levelFromXp(xp.total - xpEarned).level,
          levelAfter: level.level,
          titleUnlocked: typeof badgeTitle === "string" ? badgeTitle : null,
          achievementsUnlocked,
          firstWinOver: byPlay && firstWinOver(byPlay, user.id, fresh.id) ? opponentFirst : null,
          winStreak: Number.isFinite(streakRun) ? streakRun : null,
          gameRecord: split ? { label: split.label, wins: split.wins, losses: split.losses } : null,
        }),
        action:
          second === "back_in_line" && nightData.night
            ? { kind: "back_in_line", nightId: nightData.night.id }
            : {
                kind: "rematch",
                href: rematchHref({ opponentId, gameType: fresh.game_type, raceTo: fresh.race_to, matchId: fresh.id }),
              },
      };
    }
  }

  let firstGameFaces: FirstGameFace[] = [];
  let firstGameEyebrow = "";
  if (members) {
    const mySchoolId: string | null = me?.school_id ?? null;
    const byId = new Map(members.map((m) => [m.id, m]));
    const picked = playFaces([], members, mySchoolId).flatMap((id) => byId.get(id) ?? []);
    firstGameFaces = picked.map((m) => ({
      id: m.id,
      display_name: m.display_name,
      avatar_url: m.avatar_url,
      ball: m.ball,
    }));
    firstGameEyebrow = facesEyebrow(
      picked.map((m) => m.school_id),
      mySchoolId,
      mySchool
    );
  }

  const rating = me?.rating ?? 450;
  const change = ratingChangeSince(history ?? [], monthStart, rating);
  const above = aboveOf(rankRows, user.id);
  const lead = leadOf(rankRows, user.id);
  const badge = nextBadge(level, xp.total);
  const next = rankKnown
    ? nextLine({
        played,
        above: above ? { name: boardNames.get(above.id) ?? "Member", rank: above.rank, gap: above.gap } : null,
        lead: lead ? { name: boardNames.get(lead.id) ?? "Member", gap: lead.gap } : null,
        badge: badge ? { title: badge.title, xpToGo: badge.xpToGo } : null,
      })
    : null;

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
              <StreakFlame length={streakLength} />
            </span>
          </span>
        </Link>
        <MessagesButton />
      </header>

      {message && <p className="bg-card rounded-2xl p-3 text-sm">{message}</p>}
      {error && <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>}
      {/* Keyed by the game, so a newer one opens fresh. */}
      {moment && <GameCountsScreen key={moment.matchId} {...moment} />}

      {/* What needs you (spec §2), gold-edged, before anything else. The
          resume card renders on the client, so an empty stack hides itself. */}
      <div className="flex flex-col gap-6 empty:hidden">
        {(toConfirm ?? []).length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="eyebrow">Confirm results</h2>
            {(toConfirm ?? []).map((m) => {
              const reporter = Array.isArray(m.reporter) ? m.reporter[0] : m.reporter;
              const name = reporter?.display_name ?? "Member";
              return (
                <div key={m.id} className={cn(GOLD_EDGE, "flex flex-col gap-3.5")}>
                  <div className="flex items-center gap-3">
                    <Avatar person={reporter ?? { id: "unknown", display_name: null }} size="md" />
                    <div className="flex min-w-0 flex-col gap-[3px]">
                      <p className="truncate text-[15px] leading-tight">
                        <span className="font-medium">{firstName(name)}</span> logged a game
                      </p>
                      {/* Wraps rather than truncates: the spot, at the end,
                          is part of what the confirmer is agreeing to. */}
                      <p className="text-muted-foreground line-clamp-2 text-[12px] leading-tight">
                        {confirmMeta({
                          reporterName: name,
                          // You are always the opponent here; the reporter join
                          // can be null (RLS hides a non-approved profile).
                          reporterWon: m.winner_id !== user.id,
                          reporterScore: m.reporter_score,
                          opponentScore: m.opponent_score,
                          gameType: m.game_type,
                          raceTo: m.race_to,
                          spot: m.spot,
                          spotToMe: m.spot_to === user.id,
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {/* Disabled while in flight: a double tap must not send it twice. */}
                    <form action={rejectMatch} className="flex-1">
                      <input type="hidden" name="match_id" value={m.id} />
                      <SubmitButton variant="ghost" className="w-full" pendingChildren="Sending…">
                        Not right
                      </SubmitButton>
                    </form>
                    <form action={confirmMatch} className="flex-1">
                      <input type="hidden" name="match_id" value={m.id} />
                      <SubmitButton className="w-full" pendingChildren="Confirming…">
                        Confirm
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {atTable && (
          <section className="flex flex-col gap-2.5">
            <h2 className="eyebrow">Your table</h2>
            <div className={GOLD_EDGE}>
              <NightCard data={nightData} meId={user.id} back="/" now={now} />
            </div>
          </section>
        )}

        {flaggable.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="eyebrow">Logged for you</h2>
            {flaggable.map((m) => {
              const reporter = Array.isArray(m.reporter) ? m.reporter[0] : m.reporter;
              // As above: you are the opponent, so anything but you winning is theirs.
              const theyWon = m.winner_id !== user.id;
              return (
                <ListRow
                  key={m.id}
                  className={cn(GOLD_EDGE, "border-b-0")}
                  leading={<Avatar person={reporter ?? { id: "unknown", display_name: null }} size="md" />}
                  title={
                    <>
                      {reporter?.display_name ?? "Member"} · {theyWon ? "beat you" : "lost to you"}{" "}
                      <span className="stat-number">
                        {m.reporter_score}–{m.opponent_score}
                      </span>
                    </>
                  }
                  meta={`Counted · flag until ${flagDeadlineLabel(m.confirmed_at!, now)}`}
                  trailing={
                    <form action={disputeAgreedMatch}>
                      <input type="hidden" name="match_id" value={m.id} />
                      {/* Disabled while in flight: a double tap must not send two flags. */}
                      <SubmitButton
                        variant="link"
                        size="xs"
                        className="text-muted-foreground px-0 text-[13px] font-normal no-underline"
                        pendingChildren="Flagging…"
                      >
                        Not right?
                      </SubmitButton>
                    </form>
                  }
                />
              );
            })}
          </section>
        )}

        <ResumeGameCard meId={user.id} />
      </div>

      <NotifyPrompt />
      <LiveHome />

      <section className="flex flex-col gap-3">
        {played === 0 ? (
          <FirstGameCard eyebrow={firstGameEyebrow} faces={firstGameFaces} />
        ) : (
          <ProgressCard
            meId={user.id}
            rating={rating}
            change={change}
            form={formDots(mineByPlay, user.id)}
            played={played}
            level={level}
            xpNote={xpNote(level, xp.total)}
            next={next}
          />
        )}
        {openSeason && strip && (
          <Link
            href="/leaderboard?tab=season"
            className="press bg-card flex items-center justify-between gap-3 rounded-[20px] px-5 py-4 shadow-[inset_0_0_0_1px_var(--hairline-row)]"
          >
            <span className="flex min-w-0 flex-col gap-1.5">
              <span className="eyebrow">
                {openSeason.name} · {seasonCountdownLabel(openSeason, today)}
              </span>
              <span className="stat-number truncate text-[20px] leading-none">{strip.primary}</span>
              <span className="text-muted-foreground truncate text-[12px] leading-tight">{strip.secondary}</span>
            </span>
            <ChevronRight className="text-muted-foreground size-4 shrink-0" strokeWidth={1.7} />
          </Link>
        )}
      </section>

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

      {nightData.night && !atTable && (
        <section className="flex flex-col gap-3">
          <Link href="/night" className="eyebrow press flex items-center gap-2">
            <span aria-hidden="true" className="bg-win size-2 rounded-full motion-safe:animate-pulse" />
            Club night
            <ChevronRight className="ml-auto size-4" strokeWidth={1.7} aria-hidden="true" />
          </Link>
          <div className="bg-card rounded-[20px] p-4 shadow-[inset_0_0_0_1px_var(--hairline-row)]">
            <NightCard data={nightData} meId={user.id} back="/" now={now} />
          </div>
        </section>
      )}

      {live.length > 0 && (
        <section className="flex flex-col gap-3">
          <span className="eyebrow flex items-center gap-2">
            <span aria-hidden="true" className="bg-win motion-safe:animate-pulse size-2 rounded-full" />
            Live now
          </span>
          <ShowMore
            initial={LIVE_SHOWN}
            label="Show {hidden} more tables"
            items={live.map((g) => (
              <LiveGameCard key={g.reporter_id} row={g} viewerId={user.id} talk={talkByGame.get(g.id as string)} />
            ))}
          />
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

      {charactersEnabled() && <CharacterNudge meId={user.id} ball={ballFor(me?.ball, user.id).number} />}

      <section className="flex flex-col gap-1.5">
        <SectionHeading action={{ href: `/players/${user.id}`, label: "Your games" }}>Recent</SectionHeading>
        {recent.length === 0 && (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No results yet this season.{" "}
            <Link href="/matches/new" className="text-brass">
              Log the first game.
            </Link>
          </p>
        )}
        <ShowMore
          label="Show {hidden} more"
          items={recent.map((item) =>
            item.type === "row" ? (
              <ActivityRow key={item.row.id} row={item.row} viewerId={user.id} now={now} />
            ) : (
              <RecapRow key={item.recap.key} recap={item.recap} now={now} />
            )
          )}
        />
      </section>
    </main>
  );
}
