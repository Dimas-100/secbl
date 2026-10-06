// Pure stat helpers behind the Home and Player surfaces (design refresh,
// docs/superpowers/specs/2026-10-06-design-refresh.md). No I/O, no DOM.

export interface StatMatch {
  id: string;
  reporter_id: string;
  opponent_id: string;
  winner_id: string;
  reporter_score: number;
  opponent_score: number;
  confirmed_at: string | null;
}

export interface HistoryPoint {
  rating_before: number;
  rating_after: number;
  created_at: string;
}

export function opponentOf(m: StatMatch, viewerId: string): string {
  return m.reporter_id === viewerId ? m.opponent_id : m.reporter_id;
}

// Matches must be newest-first (the order every page already queries in).
export function currentStreak(
  newestFirst: StatMatch[],
  viewerId: string
): { kind: "W" | "L"; length: number } | null {
  if (newestFirst.length === 0) return null;
  const kind = newestFirst[0].winner_id === viewerId ? "W" : "L";
  let length = 0;
  for (const m of newestFirst) {
    if ((m.winner_id === viewerId ? "W" : "L") !== kind) break;
    length += 1;
  }
  return { kind, length };
}

export function winRate(wins: number, losses: number): number | null {
  const total = wins + losses;
  if (total === 0) return null;
  return Math.round((wins / total) * 100);
}

// Rating now minus the rating just before the first change inside the window.
export function ratingChangeSince(
  history: HistoryPoint[],
  since: Date,
  current: number
): number | null {
  const inWindow = history
    .filter((h) => Date.parse(h.created_at) >= since.getTime())
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  if (inWindow.length === 0) return null;
  return current - inWindow[0].rating_before;
}

export function peakRating(
  history: HistoryPoint[],
  current: number
): { rating: number; at: string | null } {
  let best = { rating: current, at: null as string | null };
  for (const h of history) {
    if (h.rating_after > best.rating) best = { rating: h.rating_after, at: h.created_at };
  }
  return best;
}

// Ratings oldest → newest, scaled into a width × height box. A single value
// draws as a flat line so the hero never shows an empty chart.
export function sparklinePoints(ratings: number[], width: number, height: number): [number, number][] {
  if (ratings.length === 0) return [];
  const series = ratings.length === 1 ? [ratings[0], ratings[0]] : ratings;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const flat = max === min;
  return series.map((r, i) => {
    const x = (i / (series.length - 1)) * width;
    const y = flat ? height / 2 : height - ((r - min) / (max - min)) * height;
    return [Number(x.toFixed(2)), Number(y.toFixed(2))];
  });
}

// "Today" / "Yesterday" / "Sat, Oct 3" for a played_at calendar date, given
// today's club date (from lib/events clubDateOf). Dates are plain YYYY-MM-DD,
// so this never touches time zones.
export function labelPlayedDate(playedAt: string, todayClubDate: string): string {
  if (playedAt === todayClubDate) return "Today";
  const yesterday = new Date(`${todayClubDate}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (playedAt === yesterday.toISOString().slice(0, 10)) return "Yesterday";
  return new Date(`${playedAt}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Groups newest-first matches by their played_at date, keeping order.
export function groupByPlayedDate<T extends { played_at: string }>(
  matches: T[],
  todayClubDate: string
): { label: string; date: string; matches: T[] }[] {
  const groups: { label: string; date: string; matches: T[] }[] = [];
  for (const m of matches) {
    const last = groups[groups.length - 1];
    if (last && last.date === m.played_at) last.matches.push(m);
    else groups.push({ label: labelPlayedDate(m.played_at, todayClubDate), date: m.played_at, matches: [m] });
  }
  return groups;
}

export function sparklinePath(points: [number, number][]): string {
  return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
}

// The win over the highest-rated opponent (by their current rating).
export function bestWin(
  matches: StatMatch[],
  viewerId: string,
  ratings: Record<string, number>
): { matchId: string; opponentId: string; rating: number } | null {
  let best: { matchId: string; opponentId: string; rating: number } | null = null;
  for (const m of matches) {
    if (m.winner_id !== viewerId) continue;
    const opp = opponentOf(m, viewerId);
    const rating = ratings[opp];
    if (rating === undefined) continue;
    if (!best || rating > best.rating) best = { matchId: m.id, opponentId: opp, rating };
  }
  return best;
}

export function headToHead(
  matches: StatMatch[],
  viewerId: string,
  otherId: string
): { wins: number; losses: number } {
  let wins = 0;
  let losses = 0;
  for (const m of matches) {
    const pair = new Set([m.reporter_id, m.opponent_id]);
    if (!pair.has(viewerId) || !pair.has(otherId)) continue;
    if (m.winner_id === viewerId) wins += 1;
    else losses += 1;
  }
  return { wins, losses };
}

// Per-player movement for the leaderboard: current rating minus the rating
// before their earliest change in the window. Players with no change in the
// window are left out, so the UI can show a dash.
export function movementSince(
  history: (HistoryPoint & { profile_id: string })[],
  current: Record<string, number>
): Record<string, number> {
  const earliest = new Map<string, HistoryPoint>();
  for (const h of history) {
    const have = earliest.get(h.profile_id);
    if (!have || Date.parse(h.created_at) < Date.parse(have.created_at)) earliest.set(h.profile_id, h);
  }
  const out: Record<string, number> = {};
  for (const [id, h] of earliest) {
    if (current[id] !== undefined) out[id] = current[id] - h.rating_before;
  }
  return out;
}
