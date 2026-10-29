import Link from "next/link";
import { notFound } from "next/navigation";
import { Camera, Pencil, SlidersHorizontal } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { CharacterFigure } from "@/components/character-face";
import { BackButton } from "@/components/nav-history";
import { Button } from "@/components/ui/button";
import { LevelBar } from "@/components/level-bar";
import { ListRow } from "@/components/list-row";
import { MatchRow } from "@/components/match-row";
import { MessagesButton } from "@/components/messages-button";
import { RatingChart } from "@/components/rating-chart";
import { SchoolMark } from "@/components/school-mark";
import { SectionHeading } from "@/components/section-heading";
import { ShareButton } from "@/components/share-button";
import { ShowMore } from "@/components/show-more";
import { SubmitButton } from "@/components/submit-button";
import { TitleBadge } from "@/components/title-badge";
import { ACHIEVEMENTS, earnedAchievements } from "@/lib/achievements";
import { clubDateOf, clubMonthName, clubMonthStart, clubTimeToISO } from "@/lib/events";
import { winnerDelta } from "@/lib/form";
import { firstName, formDots, PLACEMENT_GAMES } from "@/lib/home";
import { charactersEnabled } from "@/lib/character";
import { GAME_LABEL, ballFor } from "@/lib/identity";
import { nextBadge, xpCaption } from "@/lib/levels";
import { fetchAllPages } from "@/lib/paging";
import { formatShort } from "@/lib/race";
import { rankOf, toRankRow } from "@/lib/ranking";
import { loadOpenSeason } from "@/lib/season-data";
import {
  bestWin,
  byPlayOrder,
  labelPlayedDate,
  longestWinStreak,
  peakRating,
  type PlayOrdered,
  type StatMatch,
} from "@/lib/stats";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  bestWinMarker,
  chartRange,
  chartSeries,
  formSummary,
  gameSplits,
  monthSentence,
  rankAsOf,
  ratingSplits,
  rivalLine,
  rivals,
  type ChartRange,
  type YouMatch,
} from "@/lib/you";
import { loadXp } from "@/lib/xp-data";
import { startDm } from "@/app/(member)/chat/actions";

interface PlayerRef {
  id: string;
  display_name: string;
  rating: number;
  avatar_url: string | null;
  ball: number | null;
}

type PlayerMatch = StatMatch &
  YouMatch &
  PlayOrdered & {
    race_to: number | null;
    spot: number;
    spot_to: string | null;
    rating_delta_reporter: number | null;
    rating_delta_opponent: number | null;
    reporter: PlayerRef | PlayerRef[] | null;
    opponent: PlayerRef | PlayerRef[] | null;
    // Both players' ratings going into the game, for "vs higher-rated".
    rating_history: { profile_id: string; rating_before: number }[] | null;
  };

interface HistoryRow {
  match_id: string | null;
  rating_before: number;
  rating_after: number;
  created_at: string;
}

const MATCH_COLS =
  "id, reporter_id, opponent_id, reporter_score, opponent_score, game_type, played_at, created_at, confirmed_at, winner_id, race_to, spot, spot_to, rating_delta_reporter, rating_delta_opponent, reporter:profiles!matches_reporter_id_fkey(id, display_name, rating, avatar_url, ball), opponent:profiles!matches_opponent_id_fkey(id, display_name, rating, avatar_url, ball), rating_history(profile_id, rating_before)";

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const iconButton =
  "press flex size-11 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--hairline-strong)]";

const card = "bg-card rounded-[20px] shadow-[inset_0_0_0_1px_var(--hairline-row)]";

// The month sentence's "now" rank counts every confirmed game so far, so a
// game the database stamped a moment ahead of this server's clock still counts.
const ALL_SO_FAR = "9999-12-31T23:59:59.999Z";

// One page of rows, or a thrown error (ruling S3-R6): a failed read must never
// pass for "no games", or the page would say something untrue with confidence.
function rowsOrThrow<T>(
  { data, error }: { data: unknown; error: { message: string } | null },
  what: string
): T[] {
  if (error) throw new Error(`player page: couldn't read ${what}: ${error.message}`);
  return (data ?? []) as T[];
}

interface ClubRows {
  matches: { reporter_id: string; opponent_id: string; winner_id: string; confirmed_at: string | null }[];
  history: { profile_id: string; rating_after: number; created_at: string }[];
  memberIds: string[];
}

// Your own page only: the club's confirmed games, rating history and members,
// to replay your rank at the month start and now (ruling S3-R3: both ends from
// the same rows, so "You climbed" compares like with like). null when any read
// fails: the month sentence then drops its rank clause instead of inventing
// one, and the rest of the page still renders.
async function loadClubRows(supabase: Awaited<ReturnType<typeof createClient>>): Promise<ClubRows | null> {
  try {
    const [matches, history, members] = await Promise.all([
      fetchAllPages<ClubRows["matches"][number]>((from, to) =>
        supabase
          .from("matches")
          .select("reporter_id, opponent_id, winner_id, confirmed_at")
          .eq("status", "confirmed")
          .order("id")
          .range(from, to)
          .then((res) => rowsOrThrow<ClubRows["matches"][number]>(res, "the club's matches"))
      ),
      fetchAllPages<ClubRows["history"][number]>((from, to) =>
        supabase
          .from("rating_history")
          .select("profile_id, rating_after, created_at")
          .order("id")
          .range(from, to)
          .then((res) => rowsOrThrow<ClubRows["history"][number]>(res, "the club's rating history"))
      ),
      fetchAllPages<{ id: string }>((from, to) =>
        supabase
          .from("profiles")
          .select("id")
          .eq("status", "approved")
          .order("id")
          .range(from, to)
          .then((res) => rowsOrThrow<{ id: string }>(res, "the club's members"))
      ),
    ]);
    return { matches, history, memberIds: members.map((m) => m.id) };
  } catch (err) {
    console.error("player page: couldn't replay the club's ranks", err);
    return null;
  }
}

// "#3" in the month sentence reads in brass, as in the approved mockup.
function brassRanks(text: string) {
  return text.split(/(#\d+)/).map((part, i) =>
    /^#\d+$/.test(part) ? (
      <span key={i} className="text-brass">
        {part}
      </span>
    ) : (
      part
    )
  );
}

// A heading with a muted note on the right ("Form · won 7 of your last 10").
function NoteHeading({ children, note }: { children: React.ReactNode; note: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{children}</h2>
      <span className="text-muted-foreground min-w-0 truncate text-[12px]">{note}</span>
    </div>
  );
}

// The page that shows a member's progress (spec 2026-10-21-play-and-progress
// §5 You page, §6 someone else's page): level, this month in one sentence
// (yours only), the rating and its chart, form, where they win, rivals, then
// achievements and history. Everything is computed from confirmed matches
// and rating_history by lib/you.ts; at 0 games only what is true shows.
export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const [{ id }, { range: rawRange }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerId = user?.id;
  const isMe = viewerId === id;

  const now = new Date();
  const nowIso = now.toISOString();
  // "This month" is the club calendar month, as on Home (ruling S2-R4).
  const monthStart = clubMonthStart(now);

  const [
    { data: profile, error: profileError },
    all,
    history,
    { data: board },
    { count: titles },
    { count: seasonsWon },
    { xp, level },
    openSeason,
    club,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, display_name, rating, avatar_url, ball, tagline, favorite_game, schools(name, short_name, primary_color, logo_url)"
      )
      .eq("id", id)
      .maybeSingle(),
    // Every confirmed game, newest first, each with both players' ratings
    // going in (paged: PostgREST caps a response at the project's max rows).
    // A failed page throws to the error boundary (ruling S3-R6).
    fetchAllPages<PlayerMatch>((from, to) =>
      supabase
        .from("matches")
        .select(MATCH_COLS)
        .eq("status", "confirmed")
        .or(`reporter_id.eq.${id},opponent_id.eq.${id}`)
        .order("confirmed_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to)
        .then((res) => rowsOrThrow<PlayerMatch>(res, "the member's matches"))
    ),
    // The member's whole rating line, oldest first, for the chart and peak.
    fetchAllPages<HistoryRow>((from, to) =>
      supabase
        .from("rating_history")
        .select("match_id, rating_before, rating_after, created_at")
        .eq("profile_id", id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
        .then((res) => rowsOrThrow<HistoryRow>(res, "the member's rating history"))
    ),
    supabase.from("leaderboard").select("id, rating, wins, losses"),
    // Tournament titles: finals are the matches whose winner advances nowhere.
    supabase
      .from("tournament_matches")
      .select("id, tournaments!inner(status)", { count: "exact", head: true })
      .eq("winner_id", id)
      .is("winner_advances_to", null)
      .eq("tournaments.status", "complete"),
    supabase
      .from("seasons")
      .select("id", { count: "exact", head: true })
      .eq("status", "closed")
      .eq("champion_id", id),
    loadXp(supabase, id),
    loadOpenSeason(supabase),
    isMe ? loadClubRows(supabase) : null,
  ]);
  // A failed read is an error, not a missing member (ruling S3-R6): only a
  // profile that genuinely isn't there (or that RLS hides) is a 404.
  if (profileError) throw new Error(`player page: couldn't read the profile: ${profileError.message}`);
  if (!profile) notFound();
  const school = Array.isArray(profile.schools) ? profile.schools[0] : profile.schools;
  const first = firstName(profile.display_name);
  const today = clubDateOf(nowIso);

  // The record, from the same games as the form and splits below.
  const games = all.length;
  const wins = all.filter((m) => m.winner_id === id).length;
  const losses = games - wins;
  const rank = rankOf((board ?? []).map(toRankRow), id);
  const placing = games > 0 && games < PLACEMENT_GAMES;
  // The derivations below read the games as they were played (ruling S3-R7),
  // so "the last k", the form and the streaks hold when a batch is confirmed
  // out of order; the match history list keeps its confirmed order.
  const played = [...all].sort(byPlayOrder);

  // Everyone this member has played whose profile the viewer can read (RLS
  // hides suspended members): names, faces and current ratings.
  const people = new Map<string, PlayerRef>();
  const ratingBefore = new Map<string, Map<string, number>>();
  for (const m of all) {
    for (const p of [one(m.reporter), one(m.opponent)]) if (p) people.set(p.id, p);
    ratingBefore.set(m.id, new Map((m.rating_history ?? []).map((h) => [h.profile_id, h.rating_before])));
  }
  const nameOf = (pid: string) => people.get(pid)?.display_name ?? "Member";
  const ratingsById: Record<string, number> = Object.fromEntries([...people].map(([pid, p]) => [pid, p.rating]));
  const peak = peakRating(history, profile.rating);
  const best = bestWin(played, id, ratingsById);

  // The chart: Month · Season · All, Season only while one is open. An
  // unknown or stale ?range= (Season after it closed) falls back to the
  // default, so a bounded range always has a start. The default is Season
  // when this member has a line in it, else All (ruling S3-R8).
  const ranges: ChartRange[] = openSeason ? ["month", "season", "all"] : ["month", "all"];
  const seasonStart = openSeason ? clubTimeToISO(`${openSeason.starts_on}T00:00`) : null;
  const seasonPoints = seasonStart ? chartSeries(history, "season", seasonStart).points.length : 0;
  const range = chartRange(rawRange, ranges, seasonPoints);
  const startIso = range === "month" ? monthStart.toISOString() : range === "season" ? seasonStart : null;
  const series = chartSeries(history, range, startIso);
  const hrefFor: Record<ChartRange, string> = {
    month: `/players/${id}?range=month`,
    season: `/players/${id}?range=season`,
    all: `/players/${id}?range=all`,
  };
  const bestMarker = bestWinMarker(
    series.points,
    best ? { matchId: best.matchId, opponent: nameOf(best.opponentId) } : null
  );

  // Form, where they win, rivals.
  const dots = formDots(played, id, 10);
  const streak = longestWinStreak(played, id);
  const formNote = [formSummary(dots, isMe ? "your" : "their"), streak >= 2 ? `best streak ${streak}` : null]
    .filter(Boolean)
    .join(" · ");
  const splits = gameSplits(played, id);
  const vsRated = ratingSplits(played, id, ratingBefore);
  const whereRows = [
    ...splits.map((s) => ({ key: s.game, label: s.label, wins: s.wins, losses: s.losses, pct: s.pct as number | null })),
    ...(vsRated.higher.wins + vsRated.higher.losses > 0
      ? [{ key: "higher", label: "vs higher-rated", ...vsRated.higher, pct: null }]
      : []),
    ...(vsRated.lower.wins + vsRated.lower.losses > 0
      ? [{ key: "lower", label: "vs lower-rated", ...vsRated.lower, pct: null }]
      : []),
  ];
  // Only opponents whose profile the viewer can read (ruling S3-R9).
  const rivalRows = rivals(played, id, 3, new Set(people.keys()));

  // Someone else's page: your record against them, from your side.
  const together =
    viewerId && !isMe ? played.filter((m) => m.reporter_id === viewerId || m.opponent_id === viewerId) : [];
  const versus = viewerId && together.length > 0 ? rivals(together, viewerId, 1)[0] : null;
  const versusLine = versus ? rivalLine(versus, "You", first, today) : "You haven't played each other yet.";

  // Your own page: this month in one sentence. Games count by the club date
  // they were played (ruling S3-R2); the rank at both ends is replayed from
  // the same rows (S3-R3).
  let monthEyebrow: string | null = null;
  let monthBody: string | null = null;
  if (isMe) {
    const month = clubMonthName(nowIso);
    const thisMonth = all.filter((m) => m.played_at.slice(0, 7) === today.slice(0, 7));
    const last = played[0] ?? null;
    // Without the club's rows (a failed read) neither end is known, so the
    // sentence keeps its counts and drops the rank clause.
    const sentence = monthSentence({
      month,
      today,
      games: thisMonth.length,
      wins: thisMonth.filter((m) => m.winner_id === id).length,
      rankStart: club ? rankAsOf(club.memberIds, club.history, club.matches, monthStart.toISOString(), id) : null,
      rankNow: club ? rankAsOf(club.memberIds, club.history, club.matches, ALL_SO_FAR, id) : null,
      // An opponent whose profile can't be read is left unnamed (S3-R9).
      last: last
        ? {
            playedAt: last.played_at,
            opponent: people.get(last.reporter_id === id ? last.opponent_id : last.reporter_id)?.display_name ?? null,
          }
        : null,
    });
    // "October so far: 7 games, 5 wins." shows "October so far" as the
    // card's eyebrow over the rest; the no-games line has no eyebrow.
    const lead = `${month} so far: `;
    if (sentence?.startsWith(lead)) {
      monthEyebrow = `${month} so far`;
      monthBody = sentence.slice(lead.length);
    } else {
      monthBody = sentence;
    }
  }

  const achievements = earnedAchievements({
    viewerId: id,
    rating: profile.rating,
    peak: peak.rating,
    matches: played,
    opponentRatings: ratingsById,
    tournamentsWon: titles ?? 0,
    seasonsWon: seasonsWon ?? 0,
  });
  const nextAchievement = ACHIEVEMENTS.find((a) => !achievements.some((e) => e.id === a.id));
  const next = nextBadge(level, xp.total);

  return (
    <main className="flex flex-col gap-8">
      <header className="flex items-center justify-between pt-3">
        {isMe ? (
          <Link href="/settings" aria-label="Settings" className={iconButton}>
            <SlidersHorizontal className="size-5" strokeWidth={1.6} />
          </Link>
        ) : (
          <BackButton fallback="/leaderboard" />
        )}
        <MessagesButton />
      </header>

      <section className="-mt-4 flex flex-col items-center gap-[18px]">
        {charactersEnabled() ? (
          <div className="relative">
            <CharacterFigure
              id={profile.id}
              ball={ballFor(profile.ball, profile.id).number}
              progress={{
                title: level.title,
                cupsWon: titles ?? 0,
                seasonsWon: seasonsWon ?? 0,
                bestStreak: streak,
                nightsOpened: 0,
                achievements: achievements.map((a) => a.id),
              }}
              label={`${profile.display_name}'s character`}
            />
            {isMe && (
              <Link
                href="/settings/character"
                aria-label="Edit your character"
                className="bg-primary text-primary-foreground ring-background press absolute right-6 bottom-3 flex size-[38px] items-center justify-center rounded-full ring-4"
              >
                <Pencil className="size-[18px]" strokeWidth={1.8} />
              </Link>
            )}
          </div>
        ) : (
        <div className="relative size-32">
          <Avatar person={profile} size="2xl" ring="var(--brass)" />
          {isMe && (
            <Link
              href="/settings"
              aria-label={profile.avatar_url ? "Change profile photo" : "Add a profile photo"}
              className="bg-primary text-primary-foreground ring-background press absolute right-0.5 bottom-0.5 flex size-[38px] items-center justify-center rounded-full ring-4"
            >
              <Camera className="size-[18px]" strokeWidth={1.8} />
            </Link>
          )}
        </div>
        )}
        <div className="flex max-w-full flex-col items-center gap-1.5 text-center">
          <div className="flex max-w-full items-center gap-2.5">
            {/* With characters on, the photo lives here, small, so people
                can still spot each other at the hall. */}
            {charactersEnabled() && profile.avatar_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={`Photo of ${profile.display_name}`}
                width={36}
                height={36}
                className="size-9 shrink-0 rounded-full object-cover shadow-[0_0_0_1px_var(--hairline-strong)]"
              />
            )}
            <h1 className="min-w-0 truncate text-[28px] leading-[1.1] font-semibold tracking-[-0.025em]">
              {profile.display_name}
            </h1>
          </div>
          <span className="text-muted-foreground flex flex-wrap items-center justify-center gap-2 text-[13px]">
            <span className="flex items-center gap-2">
              <SchoolMark school={school} size={16} />
              {school?.name}
            </span>
            {profile.favorite_game && (
              <>
                <span aria-hidden="true" className="bg-muted-foreground/60 size-[3px] rounded-full" />
                <span>Plays {GAME_LABEL[profile.favorite_game] ?? profile.favorite_game}</span>
              </>
            )}
          </span>
          {profile.tagline && <p className="text-[14px]">{profile.tagline}</p>}
        </div>
        <div className="flex gap-2.5">
          {isMe ? (
            <>
              <Button asChild variant="ghost">
                <Link href="/settings">Edit profile</Link>
              </Button>
              <ShareButton title={`${profile.display_name} · SECBL`} />
            </>
          ) : user ? (
            <>
              <Button asChild>
                <Link href={`/matches/new?opponent=${profile.id}`}>Play {first}</Link>
              </Button>
              <form action={startDm}>
                <input type="hidden" name="profile_id" value={profile.id} />
                <SubmitButton variant="ghost" pendingChildren="Opening…">
                  Message
                </SubmitButton>
              </form>
              <ShareButton title={`${profile.display_name} · SECBL`} />
            </>
          ) : null}
        </div>
      </section>

      {!isMe && user && (
        <section aria-label={`You vs ${first}`} className={cn(card, "flex items-center justify-between gap-4 p-4")}>
          <span className="flex min-w-0 flex-col gap-1.5">
            <span className="eyebrow truncate">You vs {first}</span>
            <span className="text-muted-foreground truncate text-[12px]">{versusLine}</span>
          </span>
          {versus && (
            <span className="stat-number shrink-0 text-[26px] leading-none">
              <span className="text-win">{versus.wins}</span>
              <span className="text-muted-foreground">{" – "}</span>
              <span className="text-loss">{versus.losses}</span>
            </span>
          )}
        </section>
      )}

      <Link
        href={`/players/${id}/ladder`}
        className="press flex flex-col gap-3"
        aria-label={`Level ${level.level}, ${level.title}. ${level.intoLevel} of ${level.needed} XP into this level. Open the ladder.`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-3">
            <TitleBadge title={level.title} size={40} decorative />
            <span className="truncate text-[17px] font-semibold tracking-[-0.01em]">
              Level {level.level} <span className="text-brass font-medium">· {level.title}</span>
            </span>
          </span>
          <span className="text-muted-foreground stat-number shrink-0 text-[12px]">
            {level.intoLevel} / {level.needed} XP
          </span>
        </div>
        <LevelBar value={level.intoLevel} max={level.needed} label={`Level ${level.level} progress`} />
        {next && (
          <span className="text-muted-foreground flex items-center gap-2 text-[12px]">
            <TitleBadge title={next.title} size={20} locked decorative />
            Next: {next.title} badge at level {next.atLevel} · {next.xpToGo.toLocaleString("en-US")} XP to go
          </span>
        )}
      </Link>

      {monthBody && (
        <div className={cn(card, "p-4")}>
          {/* One sentence for screen readers and text search; the lead sits
              over it as the eyebrow. */}
          <p className="text-[16px] leading-[1.35] font-medium">
            {monthEyebrow && (
              <>
                <span className="eyebrow mb-2 block">
                  {monthEyebrow}
                  <span className="sr-only">:</span>
                </span>{" "}
              </>
            )}
            {brassRanks(monthBody)}
          </p>
        </div>
      )}

      {games === 0 ? (
        <p className={cn(card, "text-muted-foreground p-4 text-[14px]")}>
          {isMe ? "Your rating appears after your first game." : `${first}'s rating appears after their first game.`}
        </p>
      ) : (
        <section aria-label="Rating" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="eyebrow">Rating</span>
            <span className="stat-number text-[44px] leading-[1.05]">{profile.rating}</span>
            <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-[13px]">
              <span className="stat-number">
                {rank ? `#${rank} · ` : ""}
                {wins}–{losses}
              </span>
              {placing && (
                <span className="rounded-full px-2 py-px text-[11px] shadow-[inset_0_0_0_1px_var(--hairline-ghost)]">
                  placing {games}/{PLACEMENT_GAMES}
                </span>
              )}
            </span>
          </div>
          <RatingChart
            series={series}
            range={range}
            ranges={ranges}
            hrefFor={hrefFor}
            bestWin={bestMarker}
            whose={isMe ? "your" : "their"}
          />
        </section>
      )}

      {games > 0 && (
        <section aria-label="Form" className="flex flex-col gap-3">
          <NoteHeading note={formNote}>Form</NoteHeading>
          <span
            role="img"
            aria-label={`Last ${dots.length}, oldest first: ${dots.map((r) => (r === "W" ? "won" : "lost")).join(", ")}`}
            className="flex gap-1.5"
          >
            {dots.map((r, i) => (
              <span
                key={i}
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-[10px] font-semibold",
                  r === "W" ? "bg-win text-background" : "text-loss shadow-[inset_0_0_0_1.5px_var(--loss)]"
                )}
              >
                {r}
              </span>
            ))}
          </span>
        </section>
      )}

      {whereRows.length > 0 && (
        <section aria-label={isMe ? "Where you win" : `Where ${first} wins`} className="flex flex-col gap-3">
          <SectionHeading>{isMe ? "Where you win" : `Where ${first} wins`}</SectionHeading>
          <div className={cn(card, "px-4")}>
            {whereRows.map((r) => (
              <div
                key={r.key}
                className="border-hairline-row flex items-center justify-between gap-3 border-b py-3 text-[14px] last:border-b-0"
              >
                <span className="min-w-0 truncate">{r.label}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="stat-number font-medium">
                    {r.wins}–{r.losses}
                  </span>
                  <span className="text-muted-foreground stat-number w-10 text-right text-[12px]">
                    {r.pct === null ? "" : `${r.pct}%`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {rivalRows.length > 0 && (
        <section aria-label="Rivals" className="flex flex-col gap-1.5">
          <SectionHeading>Rivals</SectionHeading>
          <div className="flex flex-col [&>*:last-child]:border-b-0">
            {rivalRows.map((r) => {
              const person = people.get(r.opponentId);
              const name = nameOf(r.opponentId);
              return (
                <ListRow
                  key={r.opponentId}
                  href={`/players/${r.opponentId}`}
                  leading={<Avatar person={person ?? { id: r.opponentId, display_name: name }} size="sm" />}
                  title={name}
                  meta={rivalLine(r, isMe ? "You" : first, firstName(name), today)}
                  trailing={
                    <span className="stat-number text-[17px]">
                      <span className="text-win">{r.wins}</span>
                      <span className="text-muted-foreground">–</span>
                      <span className="text-loss">{r.losses}</span>
                    </span>
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeading>Achievements</SectionHeading>
        {achievements.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {achievements.map((a) => (
              <li
                key={a.id}
                title={a.description}
                className={cn(
                  "flex items-center gap-1.5 rounded-full py-1 pr-3 pl-2 text-[12px] font-medium shadow-[inset_0_0_0_1px_var(--hairline-ghost)]",
                  a.id === "champion" && "bg-gold text-gold-foreground shadow-none"
                )}
              >
                <span aria-hidden="true">{a.emoji}</span>
                {a.label}
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground text-[12px]">
          {achievements.length} of {ACHIEVEMENTS.length} earned
          {nextAchievement && ` · next: ${nextAchievement.label}`}
          {achievements.length === 0 && isMe && " · win a confirmed match to earn your first"}
        </p>
      </section>

      <section className="flex flex-col gap-1.5">
        <SectionHeading>Match history</SectionHeading>
        {all.length === 0 && <p className="text-muted-foreground py-4 text-sm">No confirmed matches yet.</p>}
        <ShowMore
          label="Show all {total} games"
          items={all.map((m) => {
            const reporter = one(m.reporter);
            const opponent = one(m.opponent);
            // From the match itself, never the join (RLS can hide a profile).
            const reporterWon = m.winner_id === m.reporter_id;
            return (
              <MatchRow
                key={m.id}
                winner={reporterWon ? reporter : opponent}
                loser={reporterWon ? opponent : reporter}
                winnerScore={Math.max(m.reporter_score, m.opponent_score)}
                loserScore={Math.min(m.reporter_score, m.opponent_score)}
                delta={winnerDelta(m)}
                viewerId={viewerId}
                perspectiveId={id}
                meta={labelPlayedDate(m.played_at, today)}
                gameType={GAME_LABEL[m.game_type] ?? m.game_type}
                format={formatShort(m.race_to, m.spot)}
                caption={xpCaption(m.id, xp)}
              />
            );
          })}
        />
      </section>
    </main>
  );
}
