import Link from "next/link";
import { notFound } from "next/navigation";
import { Camera, ChevronLeft, SlidersHorizontal } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/list-row";
import { MatchRow } from "@/components/match-row";
import { MessagesButton } from "@/components/messages-button";
import { SchoolDot } from "@/components/school-dot";
import { SectionHeading } from "@/components/section-heading";
import { ShareButton } from "@/components/share-button";
import { Sparkline } from "@/components/sparkline";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { SubmitButton } from "@/components/submit-button";
import { ACHIEVEMENTS, earnedAchievements } from "@/lib/achievements";
import { GAME_LABEL } from "@/lib/identity";
import { createClient } from "@/lib/supabase/server";
import { startDm } from "@/app/(member)/chat/actions";
import { clubDateOf } from "@/lib/events";
import { winnerDelta } from "@/lib/form";
import {
  bestWin,
  headToHead,
  labelPlayedDate,
  longestWinStreak,
  overallRank,
  peakRating,
  ratingChangeSince,
  winRate,
  type StatMatch,
} from "@/lib/stats";
import { cn } from "@/lib/utils";

interface PlayerRef {
  id: string;
  display_name: string;
  rating: number;
  avatar_url: string | null;
  ball: number | null;
}

type PlayerMatch = StatMatch & {
  game_type: string;
  played_at: string;
  rating_delta_reporter: number | null;
  rating_delta_opponent: number | null;
  reporter: PlayerRef | PlayerRef[] | null;
  opponent: PlayerRef | PlayerRef[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const iconButton =
  "press flex size-11 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--hairline-strong)]";

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
  const viewerId = user?.id;
  const isMe = viewerId === id;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, display_name, rating, matches_played, created_at, avatar_url, ball, tagline, favorite_game, schools(name, short_name, primary_color)"
    )
    .eq("id", id)
    .single();
  if (!profile) notFound();
  const school = Array.isArray(profile.schools) ? profile.schools[0] : profile.schools;

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

  const [{ data: history }, { data: matches }, { data: boardRow }, { data: board }, { count: titles }] =
    await Promise.all([
      supabase
        .from("rating_history")
        .select("rating_before, rating_after, created_at")
        .eq("profile_id", id)
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("matches")
        .select(
          "id, reporter_id, opponent_id, reporter_score, opponent_score, game_type, played_at, confirmed_at, winner_id, rating_delta_reporter, rating_delta_opponent, reporter:profiles!matches_reporter_id_fkey(id, display_name, rating, avatar_url, ball), opponent:profiles!matches_opponent_id_fkey(id, display_name, rating, avatar_url, ball)"
        )
        .eq("status", "confirmed")
        .or(`reporter_id.eq.${id},opponent_id.eq.${id}`)
        .order("confirmed_at", { ascending: false })
        .limit(50),
      supabase.from("leaderboard").select("wins, losses").eq("id", id).maybeSingle(),
      supabase.from("leaderboard").select("id"),
      // Tournament titles: finals are the matches whose winner advances nowhere.
      supabase
        .from("tournament_matches")
        .select("id, tournaments!inner(status)", { count: "exact", head: true })
        .eq("winner_id", id)
        .is("winner_advances_to", null)
        .eq("tournaments.status", "complete"),
    ]);

  const all = (matches ?? []) as PlayerMatch[];
  const wins = Number(boardRow?.wins ?? 0);
  const losses = Number(boardRow?.losses ?? 0);
  const rate = winRate(wins, losses);
  const rank = overallRank(board ?? [], id);
  const bestStreak = longestWinStreak(all, id);
  const peak = peakRating(history ?? [], profile.rating);
  const change = ratingChangeSince(history ?? [], monthAgo, profile.rating);
  const chronological = [...(history ?? [])].reverse().slice(-30);
  const ratings =
    chronological.length > 0
      ? [chronological[0].rating_before, ...chronological.map((h) => h.rating_after)]
      : [profile.rating];

  // Opponents' current ratings and names, for "best win".
  const ratingsById: Record<string, number> = {};
  const namesById: Record<string, string> = {};
  for (const m of all) {
    for (const p of [one(m.reporter), one(m.opponent)]) {
      if (p) {
        ratingsById[p.id] = p.rating;
        namesById[p.id] = p.display_name;
      }
    }
  }
  const best = bestWin(all, id, ratingsById);
  const h2h = viewerId && !isMe ? headToHead(all, id, viewerId) : null;
  const lastMeeting =
    viewerId && !isMe ? all.find((m) => [m.reporter_id, m.opponent_id].includes(viewerId)) : undefined;
  const today = clubDateOf(now.toISOString());
  const achievements = earnedAchievements({
    viewerId: id,
    rating: profile.rating,
    peak: peak.rating,
    matches: all,
    opponentRatings: ratingsById,
    tournamentsWon: titles ?? 0,
  });
  const nextAchievement = ACHIEVEMENTS.find((a) => !achievements.some((e) => e.id === a.id));
  const firstName = profile.display_name.split(" ")[0];

  return (
    <main className="flex flex-col gap-8">
      <header className="flex items-center justify-between pt-3">
        {isMe ? (
          <Link href="/settings" aria-label="Settings" className={iconButton}>
            <SlidersHorizontal className="size-5" strokeWidth={1.6} />
          </Link>
        ) : (
          <Link href="/leaderboard" aria-label="Back" className={iconButton}>
            <ChevronLeft className="size-5" strokeWidth={1.7} />
          </Link>
        )}
        <MessagesButton />
      </header>

      <section className="-mt-4 flex flex-col items-center gap-[18px]">
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
        <div className="flex max-w-full flex-col items-center gap-1.5 text-center">
          <h1 className="max-w-full truncate text-[28px] leading-[1.1] font-semibold tracking-[-0.025em]">
            {profile.display_name}
          </h1>
          <span className="text-muted-foreground flex flex-wrap items-center justify-center gap-2 text-[13px]">
            <span className="flex items-center gap-2">
              <SchoolDot color={school?.primary_color} />
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
              <form action={startDm}>
                <input type="hidden" name="profile_id" value={profile.id} />
                <SubmitButton pendingChildren="Opening…">Message</SubmitButton>
              </form>
              <ShareButton title={`${profile.display_name} · SECBL`} />
            </>
          ) : null}
        </div>
      </section>

      <StatGrid
        cols={4}
        className="border-hairline-divider border-b pb-[18px] [&>*]:items-center [&>*]:text-center [&>*+*]:pl-2"
      >
        <StatTile
          label="Rating"
          value={profile.rating}
          note={
            change !== null
              ? `${change >= 0 ? "+" : "−"}${Math.abs(change)} this month`
              : profile.matches_played < 10
                ? "provisional"
                : undefined
          }
        />
        <StatTile label="Rank" value={rank ? `#${rank}` : "–"} />
        <StatTile label="Record" value={`${wins}–${losses}`} note={rate === null ? undefined : `${rate}%`} />
        <StatTile label="Best streak" value={bestStreak || "–"} note={peak.at ? `peak ${peak.rating}` : undefined} />
      </StatGrid>

      <Sparkline ratings={ratings} height={44} />

      {h2h && (
        <ListRow
          title={`You vs ${firstName}`}
          meta={
            h2h.wins + h2h.losses === 0
              ? "You haven't played each other yet."
              : lastMeeting
                ? `Last played ${labelPlayedDate(lastMeeting.played_at, today).toLowerCase()}`
                : undefined
          }
          trailing={
            <span className="stat-number text-[20px]">
              <span className="text-win">{h2h.wins}</span>
              <span className="text-muted-foreground mx-1">–</span>
              <span className="text-loss">{h2h.losses}</span>
            </span>
          }
        />
      )}

      <section className="flex flex-col gap-3">
        {/* The level line lands here once the levels spec ships. */}
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

      {best && (
        <ListRow
          title="Best win"
          meta={
            <>
              over{" "}
              <Link href={`/players/${best.opponentId}`} className="text-foreground">
                {namesById[best.opponentId]}
              </Link>
            </>
          }
          trailing={<span className="text-muted-foreground stat-number text-[13px]">rated {best.rating}</span>}
        />
      )}

      <section className="flex flex-col gap-1.5">
        <SectionHeading>Match history</SectionHeading>
        {all.length === 0 && <p className="text-muted-foreground py-4 text-sm">No confirmed matches yet.</p>}
        {all.slice(0, 20).map((m) => {
          const reporter = one(m.reporter);
          const opponent = one(m.opponent);
          const reporterWon = m.winner_id === reporter?.id;
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
            />
          );
        })}
      </section>
    </main>
  );
}
