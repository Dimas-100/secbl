// One ladder order for the whole app (Play & Progress stage 2): rating desc,
// then wins desc, then id asc. Only members with a confirmed game hold a rank;
// everyone else sits at the 450 start and is unranked, so "rank" never depends
// on query order. Pure; the leaderboard view, Home, the profile and the feed's
// pass moments all go through here.
export interface RankRow {
  id: string;
  rating: number;
  wins: number;
  losses: number;
}

export function isPlaced(r: RankRow): boolean {
  return r.wins + r.losses > 0;
}

export function compareRank(a: RankRow, b: RankRow): number {
  return b.rating - a.rating || b.wins - a.wins || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// A leaderboard-view row to a RankRow. PostgREST sends bigint counts (wins,
// losses) as strings, so coerce here instead of at every call site.
export function toRankRow(r: { id: unknown; rating: unknown; wins: unknown; losses: unknown }): RankRow {
  return { id: String(r.id), rating: Number(r.rating), wins: Number(r.wins), losses: Number(r.losses) };
}

// The ladder with a just-confirmed game taken back out, for the feed's pass
// moment: the leaderboard view already counts the game, so both players go
// back to their rating_before, the winner has one win fewer and the loser one
// loss fewer (a first game leaves them unplaced again). A player with no
// rating_history row for the game is left as is. Returns new rows.
export function boardBefore(
  after: RankRow[],
  winnerId: string,
  loserId: string,
  ratingBefore: Map<string, number>
): RankRow[] {
  return after.map((p) => {
    const rating = ratingBefore.get(p.id);
    if (rating === undefined) return p;
    return {
      id: p.id,
      rating,
      wins: p.id === winnerId ? p.wins - 1 : p.wins,
      losses: p.id === loserId ? p.losses - 1 : p.losses,
    };
  });
}

// The ladder as it stood the instant one game counted, for the game-counts
// rank line (ruling S4-R5), from today's ladder and what happened since:
// each member back at the rating they carried into their first rating change
// after the game (the earliest rating_before among rating_history rows created
// after it; none, today's rating), and every game confirmed after it taken
// back out of the wins and losses. So a third party's later results, and a
// member placed only by later games, are never told as this game's doing.
// The caller reads strictly later rows, so anything stamped in the same
// instant as the game counts as part of it. Returns new rows; then
// boardBefore() takes the game itself back out.
export function ladderAt(
  today: RankRow[],
  laterHistory: { profile_id: string; rating_before: number; created_at: string }[],
  laterMatches: { reporter_id: string; opponent_id: string; winner_id: string }[]
): RankRow[] {
  const firstAfter = new Map<string, { at: number; rating: number }>();
  for (const h of laterHistory) {
    const at = Date.parse(h.created_at);
    const seen = firstAfter.get(h.profile_id);
    if (!seen || at < seen.at) firstAfter.set(h.profile_id, { at, rating: Number(h.rating_before) });
  }
  const winsSince = new Map<string, number>();
  const lossesSince = new Map<string, number>();
  for (const m of laterMatches) {
    const loser = m.winner_id === m.reporter_id ? m.opponent_id : m.reporter_id;
    winsSince.set(m.winner_id, (winsSince.get(m.winner_id) ?? 0) + 1);
    lossesSince.set(loser, (lossesSince.get(loser) ?? 0) + 1);
  }
  return today.map((p) => ({
    id: p.id,
    rating: firstAfter.get(p.id)?.rating ?? p.rating,
    wins: Math.max(0, p.wins - (winsSince.get(p.id) ?? 0)),
    losses: Math.max(0, p.losses - (lossesSince.get(p.id) ?? 0)),
  }));
}

function placed(rows: RankRow[]): RankRow[] {
  return rows.filter(isPlaced).sort(compareRank);
}

export function rankedIds(rows: RankRow[]): string[] {
  return placed(rows).map((r) => r.id);
}

export function rankOf(rows: RankRow[], id: string): number | null {
  const i = placed(rows).findIndex((r) => r.id === id);
  return i === -1 ? null : i + 1;
}

// The placed member directly above; gap = their rating minus mine (>= 0).
// null when the member is unplaced, unknown, or already #1.
export function aboveOf(rows: RankRow[], id: string): { id: string; rank: number; gap: number } | null {
  const list = placed(rows);
  const i = list.findIndex((r) => r.id === id);
  if (i < 1) return null;
  return { id: list[i - 1].id, rank: i, gap: list[i - 1].rating - list[i].rating };
}

// Only for #1 when a #2 exists; gap = my rating minus #2's.
export function leadOf(rows: RankRow[], id: string): { id: string; gap: number } | null {
  const list = placed(rows);
  if (list.length < 2 || list[0].id !== id) return null;
  return { id: list[1].id, gap: list[0].rating - list[1].rating };
}
