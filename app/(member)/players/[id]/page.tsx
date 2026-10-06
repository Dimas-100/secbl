import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HeroBand } from "@/components/hero-band";
import { MatchRow } from "@/components/match-row";
import { SectionLabel } from "@/components/section-label";
import { Sparkline } from "@/components/sparkline";
import { StatGrid, StatTile } from "@/components/stat-tile";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { startDm } from "@/app/(member)/chat/actions";
import { clubDateOf } from "@/lib/events";
import { winnerDelta } from "@/lib/form";
import {
  bestWin,
  currentStreak,
  headToHead,
  labelPlayedDate,
  peakRating,
  ratingChangeSince,
  winRate,
  type StatMatch,
} from "@/lib/stats";
import { cn } from "@/lib/utils";

const GAME_LABEL: Record<string, string> = {
  "8ball": "8-ball",
  "9ball": "9-ball",
  "10ball": "10-ball",
  other: "Other",
};

interface PlayerRef {
  id: string;
  display_name: string;
  rating: number;
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
    .select("id, display_name, rating, matches_played, created_at, schools(name, short_name)")
    .eq("id", id)
    .single();
  if (!profile) notFound();
  const school = Array.isArray(profile.schools) ? profile.schools[0] : profile.schools;

  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

  const [{ data: history }, { data: matches }, { data: boardRow }] = await Promise.all([
    supabase
      .from("rating_history")
      .select("rating_before, rating_after, created_at")
      .eq("profile_id", id)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("matches")
      .select(
        "id, reporter_id, opponent_id, reporter_score, opponent_score, game_type, played_at, confirmed_at, winner_id, rating_delta_reporter, rating_delta_opponent, reporter:profiles!matches_reporter_id_fkey(id, display_name, rating), opponent:profiles!matches_opponent_id_fkey(id, display_name, rating)"
      )
      .eq("status", "confirmed")
      .or(`reporter_id.eq.${id},opponent_id.eq.${id}`)
      .order("confirmed_at", { ascending: false })
      .limit(50),
    supabase.from("leaderboard").select("wins, losses").eq("id", id).maybeSingle(),
  ]);

  const all = (matches ?? []) as PlayerMatch[];
  const wins = Number(boardRow?.wins ?? 0);
  const losses = Number(boardRow?.losses ?? 0);
  const rate = winRate(wins, losses);
  const streak = currentStreak(all, id);
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
        <div className="mt-2 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="stat-number text-gold text-[44px] leading-none">{profile.rating}</span>
              {change !== null && (
                <span className={cn("stat-number text-sm", change >= 0 ? "text-gold" : "text-white/80")}>
                  {change >= 0 ? "▲" : "▼"} {Math.abs(change)}
                  <span className="ml-1 font-medium text-white/60">this month</span>
                </span>
              )}
            </div>
            <div className="mt-1 text-[11px] text-white/60">
              {profile.matches_played} matches{profile.matches_played < 10 && " · provisional"}
            </div>
          </div>
          <Sparkline ratings={ratings} width={128} height={40} className="text-gold shrink-0" />
        </div>
        {user && !isMe && (
          <form action={startDm} className="mt-3">
            <input type="hidden" name="profile_id" value={profile.id} />
            <SubmitButton size="sm" variant="hero" pendingChildren="Opening…">
              Message
            </SubmitButton>
          </form>
        )}
      </HeroBand>

      <div className="-mt-3 flex flex-col gap-4">
        <StatGrid>
          <StatTile label="Record" value={`${wins}–${losses}`} />
          <StatTile label="Win rate" value={rate === null ? "–" : `${rate}%`} />
          <StatTile
            label="Peak"
            value={peak.rating}
            note={peak.at ? labelPlayedDate(clubDateOf(peak.at), today) : "so far"}
          />
          <StatTile
            label="Streak"
            value={streak ? `${streak.kind}${streak.length}` : "–"}
            tone={streak ? (streak.kind === "W" ? "win" : "loss") : "default"}
          />
        </StatGrid>

        {h2h && (
          <Card>
            <CardHeader>
              <SectionLabel>Head to head</SectionLabel>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3 text-sm">
              <div>
                <div className="font-semibold">You vs {profile.display_name.split(" ")[0]}</div>
                <div className="text-muted-foreground text-xs">
                  {h2h.wins + h2h.losses === 0
                    ? "You haven't played each other yet."
                    : lastMeeting
                      ? `Last played ${labelPlayedDate(lastMeeting.played_at, today).toLowerCase()}`
                      : ""}
                </div>
              </div>
              <div className="stat-number text-2xl">
                <span className="text-win">{h2h.wins}</span>
                <span className="text-muted-foreground mx-1">–</span>
                <span className="text-loss">{h2h.losses}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {best && (
          <Card>
            <CardHeader>
              <SectionLabel>Best win</SectionLabel>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3 text-sm">
              <span>
                over{" "}
                <Link
                  href={`/players/${best.opponentId}`}
                  className="font-semibold underline-offset-2 hover:underline"
                >
                  {namesById[best.opponentId]}
                </Link>
              </span>
              <span className="stat-number text-muted-foreground">rated {best.rating}</span>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <SectionLabel>Recent matches</SectionLabel>
          </CardHeader>
          <CardContent className="divide-border/60 flex flex-col divide-y">
            {all.length === 0 && (
              <p className="text-muted-foreground py-2 text-sm">No confirmed matches yet.</p>
            )}
            {all.slice(0, 15).map((m) => {
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
                  meta={labelPlayedDate(m.played_at, today)}
                  gameType={GAME_LABEL[m.game_type] ?? m.game_type}
                />
              );
            })}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
