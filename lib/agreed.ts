// Agreed results, pure half (docs/superpowers/specs/2026-10-20-agreed-results-design.md §3):
// how long the opponent of a game counted on the spot can still say it's wrong.
import { clubDateOf, formatClubTime } from "@/lib/events";

export const AGREED_WINDOW_MS = 24 * 3_600_000;

export interface FlaggableMatch {
  status: string;
  agreed_at: string | null;
  confirmed_at: string | null;
  opponent_id: string;
}

// Only the opponent, only an agreed game that still counts, only inside the window.
export function canFlag(m: FlaggableMatch, viewerId: string, now: Date): boolean {
  if (m.status !== "confirmed" || m.agreed_at === null || m.confirmed_at === null) return false;
  if (m.opponent_id !== viewerId) return false;
  return now.getTime() < Date.parse(m.confirmed_at) + AGREED_WINDOW_MS;
}

// "9:14 PM" when the window closes today (club time), "tomorrow 9:14 PM" otherwise.
export function flagDeadlineLabel(confirmedAt: string, now: Date): string {
  const deadline = new Date(Date.parse(confirmedAt) + AGREED_WINDOW_MS).toISOString();
  const time = formatClubTime(deadline);
  return clubDateOf(deadline) === clubDateOf(now.toISOString()) ? time : `tomorrow ${time}`;
}
