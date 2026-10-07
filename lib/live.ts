// Live now, pure half (docs/superpowers/specs/2026-10-06-seasons-feed-live-design.md §3):
// what the scoreboard may publish and what a spectator's card shows.
import { raceProgress } from "@/lib/race";

// A table nobody has touched for this long is not live any more.
export const LIVE_STALE_MS = 3 * 3_600_000;
// A report sent this recently means the table is over, whatever a publish
// still in flight says.
export const SENT_WINDOW_MS = 60_000;
export const GAME_TYPES = ["8ball", "9ball", "10ball", "other"] as const;
// Cards above the fold on Home; the rest sit behind "Show more".
export const LIVE_SHOWN = 3;

export interface LiveInput {
  opponentId: string;
  gameType: string;
  raceTo: number | null;
  spot: number;
  spotTo: "me" | "them" | null;
  you: number;
  them: number;
}

export function validateLive(i: LiveInput, meId: string): string | null {
  if (!i.opponentId || i.opponentId === meId) return "Pick an opponent";
  if (!(GAME_TYPES as readonly string[]).includes(i.gameType)) return "Pick a game";
  if (i.raceTo !== null && (!Number.isInteger(i.raceTo) || i.raceTo < 1 || i.raceTo > 25)) return "Pick a race length";
  if (
    !Number.isInteger(i.spot) ||
    i.spot < 0 ||
    (i.raceTo !== null && i.spot >= i.raceTo) ||
    (i.raceTo === null && i.spot > 0) ||
    (i.spot === 0) !== (i.spotTo === null)
  ) {
    return "That spot doesn't fit the race";
  }
  if (![i.you, i.them].every((n) => Number.isInteger(n) && n >= 0 && n <= 99)) return "Bad score";
  return null;
}

// Rails per side (0..1) and the one line under the score.
export function liveLine(row: { reporter_score: number; opponent_score: number; race_to: number | null }): {
  reporter: number;
  opponent: number;
  need: string | null;
} {
  const reporter = raceProgress(row.reporter_score, row.race_to);
  const opponent = raceProgress(row.opponent_score, row.race_to);
  if (!row.race_to) return { reporter, opponent, need: null };
  const lead = Math.max(row.reporter_score, row.opponent_score);
  return {
    reporter,
    opponent,
    need: lead >= row.race_to ? "Finished" : `First to ${row.race_to} · leader needs ${row.race_to - lead}`,
  };
}

// Home's order for live tables: yours, then the ones you are playing at,
// then your school's, then everyone else's — newest touched first within
// each group, so a league night with ten tables still leads with what you
// care about.
export interface LiveOrderRow {
  reporter_id: string;
  opponent_id: string;
  reporter_school: string | null;
  opponent_school: string | null;
  updated_at: string;
}
export function orderLiveGames<T extends LiveOrderRow>(rows: T[], viewer: { meId: string; mySchool: string | null }): T[] {
  const group = (r: T) => {
    if (r.reporter_id === viewer.meId) return 0;
    if (r.opponent_id === viewer.meId) return 1;
    if (viewer.mySchool && (r.reporter_school === viewer.mySchool || r.opponent_school === viewer.mySchool)) return 2;
    return 3;
  };
  return [...rows].sort((a, b) => group(a) - group(b) || Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

export function recentlySent(createdAt: string | null, now: Date): boolean {
  return createdAt !== null && now.getTime() - Date.parse(createdAt) < SENT_WINDOW_MS;
}

export function isFresh(updatedAt: string, now: Date): boolean {
  return now.getTime() - Date.parse(updatedAt) < LIVE_STALE_MS;
}
