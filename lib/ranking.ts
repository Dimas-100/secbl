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
