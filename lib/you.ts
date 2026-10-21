// The You page's story from match results only (spec 2026-10-21-play-and-progress
// stage 3): the form note, where you win per game, how you do against higher-
// and lower-rated opponents, and your rivals. Pure, so vitest covers every
// branch. Match lists are newest first.

import { GAME_LABEL } from "@/lib/identity";
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

// "won 7 of your last 10" from formDots' output.
export function formSummary(dots: ("W" | "L")[]): string {
  const won = dots.filter((d) => d === "W").length;
  return `won ${won} of your last ${dots.length}`;
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
        lastPlayedAt: ms[0].played_at,
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
