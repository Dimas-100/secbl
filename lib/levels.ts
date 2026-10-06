// The effort ladder (docs/superpowers/specs/2026-10-06-levels-xp-design.md).
// Computed, never stored — XP is a deterministic replay of confirmed matches
// in confirmed_at order, so it can never drift from the match record and
// needs no write path or RLS. Rating (lib/rating.ts) measures skill and
// moves both ways; this only goes up.

export const TITLES = [
  { name: "Rookie", from: 1 },
  { name: "Regular", from: 5 },
  { name: "Shark", from: 10 },
  { name: "Hustler", from: 15 },
  { name: "Master", from: 25 },
  { name: "Legend", from: 40 },
] as const;

export type Title = (typeof TITLES)[number];
export type TitleName = Title["name"];

export const XP_WIN = 200;
export const XP_LOSS = 80;
export const XP_FINAL_BONUS = 300;
// Per pair of players, per club week: only this many confirmed matches earn
// XP (for both). Opponent confirmation stops invented results; this stops two
// friends trading wins.
export const WEEKLY_PAIR_CAP = 3;

// XP to go from `level` to `level + 1`.
export function xpToNext(level: number): number {
  return 100 + 50 * (level - 1);
}

// Total XP needed to reach `level` (closed form of the sum above).
export function xpToReach(level: number): number {
  const n = level - 1;
  return 100 * n + 25 * n * (n - 1);
}

export function titleFor(level: number): Title {
  let current: Title = TITLES[0];
  for (const t of TITLES) if (level >= t.from) current = t;
  return current;
}

export interface LevelInfo {
  level: number;
  title: TitleName;
  intoLevel: number;
  needed: number;
  nextTitle: TitleName | null;
  levelsToNextTitle: number | null;
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  while (xpToReach(level + 1) <= xp) level += 1;
  const title = titleFor(level);
  const next = TITLES.find((t) => t.from > level) ?? null;
  return {
    level,
    title: title.name,
    intoLevel: xp - xpToReach(level),
    needed: xpToNext(level),
    nextTitle: next?.name ?? null,
    levelsToNextTitle: next ? next.from - level : null,
  };
}

// The badge to chase: the next title, the level it unlocks at, and the XP
// still to earn. Null once a member is a Legend.
export function nextBadge(
  level: LevelInfo,
  xpTotal: number
): { title: TitleName; atLevel: number; xpToGo: number } | null {
  const next = TITLES.find((t) => t.from > level.level);
  if (!next) return null;
  return { title: next.name, atLevel: next.from, xpToGo: xpToReach(next.from) - xpTotal };
}

export interface XpMatch {
  id: string;
  reporter_id: string;
  opponent_id: string;
  winner_id: string;
  status: string;
  confirmed_at: string | null;
  // True when this is a tournament final the viewer won (set by the caller
  // from tournament_matches; same trigger as the Champion achievement).
  is_final?: boolean;
}

export interface XpResult {
  total: number;
  // XP the viewer earned per match id (0 when capped). Matches the viewer
  // did not play are absent.
  perMatch: Map<string, number>;
  capped: Set<string>;
}

export function xpFromMatches(
  viewerId: string,
  matches: XpMatch[],
  clubWeekOf: (iso: string) => string
): XpResult {
  const seen = new Set<string>();
  const mine = matches
    .filter(
      (m) =>
        m.status === "confirmed" &&
        m.confirmed_at &&
        (m.reporter_id === viewerId || m.opponent_id === viewerId)
    )
    .filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    })
    .sort(
      (a, b) =>
        Date.parse(a.confirmed_at!) - Date.parse(b.confirmed_at!) || a.id.localeCompare(b.id)
    );

  const perMatch = new Map<string, number>();
  const capped = new Set<string>();
  const pairWeekCount = new Map<string, number>();
  let total = 0;
  for (const m of mine) {
    const opponent = m.reporter_id === viewerId ? m.opponent_id : m.reporter_id;
    // The key sorts the pair, so both players count the same matches.
    const key = `${[viewerId, opponent].sort().join(":")}@${clubWeekOf(m.confirmed_at!)}`;
    const n = (pairWeekCount.get(key) ?? 0) + 1;
    pairWeekCount.set(key, n);
    const won = m.winner_id === viewerId;
    let xp = 0;
    if (n <= WEEKLY_PAIR_CAP) xp += won ? XP_WIN : XP_LOSS;
    else capped.add(m.id);
    if (won && m.is_final) xp += XP_FINAL_BONUS;
    perMatch.set(m.id, xp);
    total += xp;
  }
  return { total, perMatch, capped };
}

// The caption under a match row's rating delta. Null for a row the viewer
// did not play (league-wide feeds), so it never claims a limit applied.
export function xpCaption(matchId: string, xp: XpResult): string | null {
  if (!xp.perMatch.has(matchId)) return null;
  if (xp.capped.has(matchId)) return "No XP — weekly limit";
  return `+${xp.perMatch.get(matchId)} XP`;
}
