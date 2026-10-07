// Semester seasons (docs/superpowers/specs/2026-10-06-seasons-feed-live-design.md §1).
// Standings are computed from confirmed matches by played_at — nothing is
// stamped on a match, so the board can never disagree with the record.
// Ratings (lib/rating.ts) and XP (lib/levels.ts) are untouched by a season.

export const POINTS_WIN = 3;
export const POINTS_LOSS = 1;

export interface SeasonRange {
  // Club dates, YYYY-MM-DD.
  starts_on: string;
  ends_on: string | null;
}

export interface SeasonMatch {
  id: string;
  reporter_id: string;
  opponent_id: string;
  winner_id: string;
  played_at: string;
}

export interface Standing {
  id: string;
  display_name: string;
  played: number;
  wins: number;
  losses: number;
  points: number;
  rank: number;
}

// Club dates are YYYY-MM-DD, so string order is date order.
export function inSeason(playedAt: string, season: SeasonRange): boolean {
  return playedAt >= season.starts_on && (season.ends_on === null || playedAt <= season.ends_on);
}

const byName = (a: Standing, b: Standing) =>
  a.display_name.localeCompare(b.display_name) || a.id.localeCompare(b.id);

// Every member listed (zero-point rows last). Points desc, wins desc, then
// points earned against the others in the tied group, then name.
export function seasonStandings(
  matches: SeasonMatch[],
  members: { id: string; display_name: string }[],
  season: SeasonRange
): Standing[] {
  const rows = new Map<string, Standing>();
  for (const m of members) {
    rows.set(m.id, { id: m.id, display_name: m.display_name, played: 0, wins: 0, losses: 0, points: 0, rank: 0 });
  }
  const inRange = matches.filter(
    (m) => inSeason(m.played_at, season) && rows.has(m.reporter_id) && rows.has(m.opponent_id)
  );
  for (const m of inRange) {
    for (const id of [m.reporter_id, m.opponent_id]) {
      const r = rows.get(id)!;
      r.played += 1;
      if (m.winner_id === id) {
        r.wins += 1;
        r.points += POINTS_WIN;
      } else {
        r.losses += 1;
        r.points += POINTS_LOSS;
      }
    }
  }
  const sorted = [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || byName(a, b));
  const out: Standing[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].points === sorted[i].points && sorted[j].wins === sorted[i].wins) j++;
    const group = sorted.slice(i, j);
    if (group.length > 1) {
      const ids = new Set(group.map((g) => g.id));
      const h2h = new Map(group.map((g) => [g.id, 0]));
      for (const m of inRange) {
        if (!ids.has(m.reporter_id) || !ids.has(m.opponent_id)) continue;
        const loser = m.winner_id === m.reporter_id ? m.opponent_id : m.reporter_id;
        h2h.set(m.winner_id, h2h.get(m.winner_id)! + POINTS_WIN);
        h2h.set(loser, h2h.get(loser)! + POINTS_LOSS);
      }
      group.sort((a, b) => h2h.get(b.id)! - h2h.get(a.id)! || byName(a, b));
    }
    out.push(...group);
    i = j;
  }
  out.forEach((r, idx) => {
    r.rank = idx + 1;
  });
  return out;
}

export function seasonChampion(standings: Standing[]): Standing | null {
  return standings.find((s) => s.played > 0) ?? null;
}

function utc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// b − a in whole days, both club dates.
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

// Null without a planned end; negative once it has passed.
export function daysLeft(season: SeasonRange, today: string): number | null {
  return season.ends_on === null ? null : daysBetween(today, season.ends_on);
}

export function seasonProgress(season: SeasonRange, today: string): number | null {
  if (season.ends_on === null) return null;
  const total = daysBetween(season.starts_on, season.ends_on);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, daysBetween(season.starts_on, today) / total));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Aug 20" from a club date, with no timezone in the way.
export function formatClubDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function seasonCountdownLabel(
  season: SeasonRange & { status: "open" | "closed" },
  today: string
): string {
  if (season.status === "closed") return `Ended ${formatClubDate(season.ends_on ?? today)}`;
  const left = daysLeft(season, today);
  if (left === null) return `Started ${formatClubDate(season.starts_on)}`;
  if (left < 0) return `Ended ${formatClubDate(season.ends_on!)}`;
  if (left === 0) return "Ends today";
  return `${left} day${left === 1 ? "" : "s"} left`;
}
