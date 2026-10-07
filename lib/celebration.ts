// The result celebration on Home and the streak flame, pure half. A
// confirmation is the moment the rating and XP actually move, and until now
// it was silent; this decides what to show, from data that already exists
// (rating_history, the XP replay, the feed's badge and streak rows).

export const CELEBRATE_WINDOW_MS = 24 * 3_600_000;
// Per-device "already seen" list, the same way the notify prompt snoozes.
export const DISMISSED_KEY = "secbl:celebrated";
const DISMISSED_MAX = 20;

export interface CelebrationMatch {
  id: string;
  reporter_id: string;
  opponent_id: string;
  winner_id: string;
  reporter_score: number;
  opponent_score: number;
  confirmed_at: string | null;
}

// Matches newest first (the order every page queries in).
export function freshMatch<T extends CelebrationMatch>(newestFirst: T[], now: Date): T | null {
  const m = newestFirst[0];
  if (!m || !m.confirmed_at) return null;
  return now.getTime() - Date.parse(m.confirmed_at) < CELEBRATE_WINDOW_MS ? m : null;
}

export function headline(m: CelebrationMatch, meId: string, opponentName: string): string {
  const mine = m.reporter_id === meId ? m.reporter_score : m.opponent_score;
  const theirs = m.reporter_id === meId ? m.opponent_score : m.reporter_score;
  const first = opponentName.trim().split(/\s+/)[0] || opponentName;
  return `${m.winner_id === meId ? "Won" : "Lost"} ${mine}–${theirs} vs ${first}`;
}

export type StreakTier = "none" | "warm" | "hot" | "blaze";
export function streakTier(length: number): StreakTier {
  if (length >= 10) return "blaze";
  if (length >= 5) return "hot";
  if (length >= 3) return "warm";
  return "none";
}

export function dismissedIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function withDismissed(raw: string | null, id: string): string {
  const ids = dismissedIds(raw).filter((x) => x !== id);
  ids.push(id);
  return JSON.stringify(ids.slice(-DISMISSED_MAX));
}
