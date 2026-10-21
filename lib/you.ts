// The You page's story from match results only (spec 2026-10-21-play-and-progress
// stage 3): the form note, where you win per game, how you do against higher-
// and lower-rated opponents, your rivals, the month in one sentence, your rank
// at an instant and the rating chart's series and copy. Pure, so vitest covers
// every branch. Match lists are newest first in play order (lib/stats
// byPlayOrder, ruling S3-R7), so "the last k" means the games as played.

import { shortClubDate } from "@/lib/events";
import { firstName } from "@/lib/home";
import { GAME_LABEL } from "@/lib/identity";
import { rankOf, type RankRow } from "@/lib/ranking";
import { STARTING_RATING } from "@/lib/rating";
import { labelPlayedDate } from "@/lib/stats";

export interface YouMatch {
  id: string;
  reporter_id: string;
  opponent_id: string;
  winner_id: string;
  game_type: string;
  played_at: string;
  confirmed_at: string | null;
}

const opponentOf = (m: YouMatch, ownerId: string) => (m.reporter_id === ownerId ? m.opponent_id : m.reporter_id);

// "won 7 of your last 10" from formDots' output; "their" on someone else's
// page, where "your" would be about the viewer.
export function formSummary(dots: ("W" | "L")[], whose: "your" | "their" = "your"): string {
  const won = dots.filter((d) => d === "W").length;
  return `won ${won} of ${whose} last ${dots.length}`;
}

// W–L per game type, the most played first (ties keep the more recent game first).
export function gameSplits(
  newestFirst: YouMatch[],
  ownerId: string
): { game: string; label: string; wins: number; losses: number; pct: number }[] {
  const byGame = new Map<string, { wins: number; losses: number }>();
  for (const m of newestFirst) {
    const g = byGame.get(m.game_type) ?? { wins: 0, losses: 0 };
    if (m.winner_id === ownerId) g.wins += 1;
    else g.losses += 1;
    byGame.set(m.game_type, g);
  }
  return [...byGame.entries()]
    .map(([game, { wins, losses }]) => ({
      game,
      label: GAME_LABEL[game] ?? game,
      wins,
      losses,
      pct: Math.round((wins / (wins + losses)) * 100),
    }))
    .sort((a, b) => b.wins + b.losses - (a.wins + a.losses));
}

// W–L against opponents rated higher / lower than you were going into the
// match. ratingBefore: match_id -> profile_id -> rating_before. Equal ratings
// and matches without both ratings count in neither.
export function ratingSplits(
  newestFirst: YouMatch[],
  ownerId: string,
  ratingBefore: Map<string, Map<string, number>>
): { higher: { wins: number; losses: number }; lower: { wins: number; losses: number } } {
  const out = { higher: { wins: 0, losses: 0 }, lower: { wins: 0, losses: 0 } };
  for (const m of newestFirst) {
    const ratings = ratingBefore.get(m.id);
    const mine = ratings?.get(ownerId);
    const theirs = ratings?.get(opponentOf(m, ownerId));
    if (mine === undefined || theirs === undefined || mine === theirs) continue;
    const bucket = theirs > mine ? out.higher : out.lower;
    if (m.winner_id === ownerId) bucket.wins += 1;
    else bucket.losses += 1;
  }
  return out;
}

// The opponents played most (then most recently), with the current streak
// between the two when it is at least two games long.
export function rivals(
  newestFirst: YouMatch[],
  ownerId: string,
  n = 3
): {
  opponentId: string;
  games: number;
  wins: number;
  losses: number;
  run: { k: number; ownerWon: boolean } | null;
  lastPlayedAt: string;
}[] {
  const byOpp = new Map<string, YouMatch[]>();
  for (const m of newestFirst) {
    const opp = opponentOf(m, ownerId);
    const list = byOpp.get(opp);
    if (list) list.push(m);
    else byOpp.set(opp, [m]);
  }
  return [...byOpp.entries()]
    .map(([opponentId, ms]) => {
      const wins = ms.filter((m) => m.winner_id === ownerId).length;
      const first = ms[0].winner_id;
      let k = 0;
      while (k < ms.length && ms[k].winner_id === first) k += 1;
      return {
        opponentId,
        games: ms.length,
        wins,
        losses: ms.length - wins,
        run: k >= 2 ? { k, ownerWon: first === ownerId } : null,
        // The newest played_at, not the first in confirmation order: a game
        // confirmed late must not name an older date (ruling S3-R6).
        lastPlayedAt: ms.reduce((last, m) => (m.played_at > last ? m.played_at : last), ms[0].played_at),
        newest: newestFirst.indexOf(ms[0]),
      };
    })
    .sort((a, b) => b.games - a.games || a.newest - b.newest)
    .slice(0, n)
    .map((r) => ({
      opponentId: r.opponentId,
      games: r.games,
      wins: r.wins,
      losses: r.losses,
      run: r.run,
      lastPlayedAt: r.lastPlayedAt,
    }));
}

// One line under a rival: who holds the run, else when you last played.
// owner is "You" on your own page, else the page owner's first name.
export function rivalLine(
  r: { run: { k: number; ownerWon: boolean } | null; lastPlayedAt: string },
  owner: string,
  opp: string,
  todayClubDate: string
): string {
  if (r.run) {
    const who = r.run.ownerWon ? (owner === "You" ? "You've" : `${owner} has`) : `${opp} has`;
    return `${who} won the last ${r.run.k}`;
  }
  const label = labelPlayedDate(r.lastPlayedAt, todayClubDate);
  // "Today"/"Yesterday" lowercase after "Last played "; dates read as they are.
  const natural = label === "Today" || label === "Yesterday" ? label.toLowerCase() : label;
  return `Last played ${natural}`;
}

// A member's rank at an instant (e.g. clubMonthStart), replayed through
// lib/ranking's one order. Only rows strictly before the instant count: each
// member's rating is their latest rating_after before it (STARTING_RATING with
// none), and their record is their games confirmed before it, so a member with
// no such game is unranked, exactly as on the leaderboard. rating_history rows
// are written in the same transaction that stamps confirmed_at, so the two
// agree on which side of the instant a game falls.
export function rankAsOf(
  memberIds: string[],
  history: { profile_id: string; rating_after: number; created_at: string }[],
  matches: { reporter_id: string; opponent_id: string; winner_id: string; confirmed_at: string | null }[],
  atIso: string,
  id: string
): number | null {
  const at = Date.parse(atIso);
  const before = (iso: string | null) => iso !== null && Date.parse(iso) < at;

  const latest = new Map<string, { rating: number; t: number }>();
  for (const h of history) {
    if (!before(h.created_at)) continue;
    const t = Date.parse(h.created_at);
    const seen = latest.get(h.profile_id);
    if (!seen || t >= seen.t) latest.set(h.profile_id, { rating: h.rating_after, t });
  }

  const record = new Map<string, { wins: number; losses: number }>();
  for (const m of matches) {
    if (!before(m.confirmed_at)) continue;
    for (const p of [m.reporter_id, m.opponent_id]) {
      const r = record.get(p) ?? { wins: 0, losses: 0 };
      if (m.winner_id === p) r.wins += 1;
      else r.losses += 1;
      record.set(p, r);
    }
  }

  const rows: RankRow[] = [...new Set(memberIds)].map((pid) => ({
    id: pid,
    rating: latest.get(pid)?.rating ?? STARTING_RATING,
    wins: record.get(pid)?.wins ?? 0,
    losses: record.get(pid)?.losses ?? 0,
  }));
  return rankOf(rows, id);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The month card on your own page. month is the club month's name
// (clubMonthName); games and wins count this month's confirmed games; ranks
// are rankAsOf at the month start and rankOf now; last is the newest game
// (played_at club date and the opponent's name) for the no-games line. Only a
// true clause appears: a climb needs a rank at both ends. null: no games ever.
export function monthSentence(input: {
  month: string;
  games: number;
  wins: number;
  rankStart: number | null;
  rankNow: number | null;
  last: { playedAt: string; opponent: string } | null;
}): string | null {
  const { month, games, wins, rankStart, rankNow, last } = input;
  if (games > 0) {
    const head = `${month} so far: ${plural(games, "game")}, ${plural(wins, "win")}.`;
    if (rankNow !== null && rankStart !== null && rankNow < rankStart) {
      return `${head} You climbed from #${rankStart} to #${rankNow}.`;
    }
    if (rankNow !== null && rankStart === null) return `${head} You're on the board at #${rankNow}.`;
    return head;
  }
  if (!last) return null;
  return `No games yet in ${month}. Your last was ${shortClubDate(last.playedAt)} vs ${firstName(last.opponent)}.`;
}

export type ChartRange = "month" | "season" | "all";

export const CHART_RANGE_LABEL: Record<ChartRange, string> = { month: "Month", season: "Season", all: "All" };

// The range the chart opens on. An explicit ?range= that is on offer is
// honoured, even when it is empty. Otherwise Season while one is open and
// this member has a line in it (2+ points), else All (ruling S3-R8): an empty
// chart by default would hide the progress the page exists to show.
// seasonPoints: the season series' point count (0 with no open season).
export function chartRange(asked: string | string[] | undefined, ranges: ChartRange[], seasonPoints: number): ChartRange {
  const wanted = typeof asked === "string" ? ranges.find((r) => r === asked) : undefined;
  if (wanted) return wanted;
  return ranges.includes("season") && seasonPoints >= 2 ? "season" : "all";
}

export interface ChartPoint {
  at: string;
  rating: number;
  matchId: string | null;
}

export interface ChartSeries {
  points: ChartPoint[];
  change: number | null;
  peak: { index: number; rating: number } | null;
}

// The rating line for a range: rows created at or after startIso (every row
// for "all", or when startIso is null). The first point is the rating going
// into the range's first game (its rating_before, matchId null), then one
// point per game. change = last − first and peak (the max, first reached) are
// null with fewer than 2 points, so an empty range never reads "+0". The peak
// is also null when the max is the opening point (ruling S3-R4): a rating held
// since before the range was not reached in it, so a losing month never reads
// "peak 520". The page never asks for a bounded range with a null start.
export function chartSeries(
  historyOldestFirst: { match_id: string | null; rating_before: number; rating_after: number; created_at: string }[],
  range: ChartRange,
  startIso: string | null
): ChartSeries {
  const since = range === "all" || startIso === null ? null : Date.parse(startIso);
  const rows = since === null ? historyOldestFirst : historyOldestFirst.filter((h) => Date.parse(h.created_at) >= since);
  if (rows.length === 0) return { points: [], change: null, peak: null };

  const points: ChartPoint[] = [
    { at: rows[0].created_at, rating: rows[0].rating_before, matchId: null },
    ...rows.map((h) => ({ at: h.created_at, rating: h.rating_after, matchId: h.match_id })),
  ];
  let peak = { index: 0, rating: points[0].rating };
  points.forEach((p, index) => {
    if (p.rating > peak.rating) peak = { index, rating: p.rating };
  });
  return { points, change: points[points.length - 1].rating - points[0].rating, peak: peak.index > 0 ? peak : null };
}

const RANGE_SPAN: Record<Exclude<ChartRange, "all">, string> = {
  month: "this month",
  season: "this season",
};

// The change line's colour: a gain in the win colour, a loss in the loss
// colour, no change (the "+0" convention) muted, neither won nor lost.
export function chartChangeTone(change: number): "win" | "loss" | "muted" {
  return change > 0 ? "win" : change < 0 ? "loss" : "muted";
}

// "+12 this month", "−8 this season" (U+2212), "+42 since your first game";
// "since their first game" on someone else's page.
export function chartChangeLabel(change: number, range: ChartRange, whose: "your" | "their" = "your"): string {
  const span = range === "all" ? `since ${whose} first game` : RANGE_SPAN[range];
  return `${change >= 0 ? "+" : "−"}${Math.abs(change)} ${span}`;
}

// In place of the chart when a range has fewer than 2 points. The page hides
// the chart at 0 games, so "all" only needs a fallback.
export function chartEmptyLabel(range: ChartRange): string {
  return range === "all" ? "No rated games yet" : `No rated games ${RANGE_SPAN[range]}`;
}

const ARIA_SPAN: Record<ChartRange, string> = { month: "this month", season: "this season", all: "all time" };

// "Rating chart, this season: 470 to 512, peak 512, best win over Sam". The
// chart is one role="img", so its visible marker labels are not read on their
// own: each marker the chart draws (the peak when series.peak is set, the best
// win when bestWin is passed) is spoken here instead. Only for a series with
// points.
export function chartAriaLabel(series: ChartSeries, range: ChartRange, bestWin: { first: string } | null): string {
  const { points, peak } = series;
  return [
    `Rating chart, ${ARIA_SPAN[range]}: ${points[0]?.rating} to ${points[points.length - 1]?.rating}`,
    peak ? `peak ${peak.rating}` : null,
    bestWin ? `best win over ${bestWin.first}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

// The best-win marker sits on the point that win produced (its rating_after),
// labelled "beat {first}". null when there is no best win or that game is
// outside the range.
export function bestWinMarker(
  points: { matchId: string | null }[],
  best: { matchId: string; opponent: string } | null
): { index: number; label: string; first: string } | null {
  if (!best) return null;
  const index = points.findIndex((p) => p.matchId === best.matchId);
  const first = firstName(best.opponent);
  return index === -1 ? null : { index, label: `beat ${first}`, first };
}
