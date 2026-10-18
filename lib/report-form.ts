// Pure logic for the one-screen report form, kept out of the component so
// vitest covers it without DOM tooling.

import { formatClubDate } from "@/lib/season";
import type { MatchStatus } from "@/lib/types";

export function recentOpponents<T extends { id: string; display_name: string }>(
  matchOpponentIds: string[],
  all: T[],
  n = 4
): T[] {
  const byId = new Map(all.map((o) => [o.id, o]));
  const picked: T[] = [];
  const seen = new Set<string>();
  for (const id of matchOpponentIds) {
    const o = byId.get(id);
    if (o && !seen.has(id)) {
      picked.push(o);
      seen.add(id);
      if (picked.length === n) return picked;
    }
  }
  const fill = [...all]
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
    .filter((o) => !seen.has(o.id));
  return [...picked, ...fill.slice(0, n - picked.length)];
}

export function stepScore(current: number, delta: 1 | -1): number {
  return Math.min(99, Math.max(0, current + delta));
}

export function submitState(
  you: number,
  them: number,
  opponentName: string | null
): { label: string; disabled: boolean; reason: string | null } {
  if (!opponentName)
    return { label: "Send to confirm", disabled: true, reason: "Pick your opponent" };
  if (you === 0 && them === 0)
    return { label: "Send to confirm", disabled: true, reason: "Enter the score" };
  if (you === them)
    return { label: "Send to confirm", disabled: true, reason: "Scores can't be equal" };
  return { label: `Send to ${opponentName} to confirm`, disabled: false, reason: null };
}

// The line under the scores. U+2013 en dash between scores, matching how
// scores render app-wide.
export function resultLine(
  you: number,
  them: number
): { text: string; tone: "win" | "loss" | "muted" } {
  if (you === 0 && them === 0) return { text: "Enter the score", tone: "muted" };
  if (you === them) return { text: "Scores can't be equal", tone: "muted" };
  return you > them
    ? { text: `Win ${you}–${them}`, tone: "win" }
    : { text: `Loss ${you}–${them}`, tone: "loss" };
}

// --- Same game logged twice -------------------------------------------------
// On 2026-10-15 both players logged one race seconds apart; confirming the
// second copy would have counted the game twice. Before a report goes in, the
// form looks for a game between the same two players on the same day that is
// still live (pending) or already counted (confirmed).

export interface PairMatchRow {
  id: string;
  status: MatchStatus;
  reporter_id: string;
  opponent_id: string;
  reporter_score: number;
  opponent_score: number;
  played_at: string;
  created_at: string;
}

export interface DuplicateGame {
  id: string;
  status: "pending" | "confirmed";
  reportedByMe: boolean;
  myScore: number;
  theirScore: number;
  playedAt: string;
}

// The opponent's report waiting on you comes first (confirming it is the
// fix); otherwise the newest game.
export function findDuplicate(
  rows: PairMatchRow[],
  meId: string,
  opponentId: string,
  playedAt: string
): DuplicateGame | null {
  const same = rows
    .filter(
      (r) =>
        r.played_at === playedAt &&
        (r.status === "pending" || r.status === "confirmed") &&
        ((r.reporter_id === meId && r.opponent_id === opponentId) ||
          (r.reporter_id === opponentId && r.opponent_id === meId))
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const pick = same.find((r) => r.status === "pending" && r.opponent_id === meId) ?? same[0];
  if (!pick) return null;
  const mine = pick.reporter_id === meId;
  return {
    id: pick.id,
    status: pick.status as DuplicateGame["status"],
    reportedByMe: mine,
    myScore: mine ? pick.reporter_score : pick.opponent_score,
    theirScore: mine ? pick.opponent_score : pick.reporter_score,
    playedAt: pick.played_at,
  };
}

export function duplicateNotice(
  dup: DuplicateGame,
  opponentFirst: string,
  today: string
): { title: string; detail: string; canConfirm: boolean } {
  const when = dup.playedAt === today ? "today" : `on ${formatClubDate(dup.playedAt)}`;
  const line =
    dup.myScore > dup.theirScore
      ? `You won ${dup.myScore}–${dup.theirScore}`
      : `${opponentFirst} won ${dup.theirScore}–${dup.myScore}`;
  if (dup.status === "confirmed") {
    return {
      title: `You and ${opponentFirst} already have a game ${when}`,
      detail: `${line} — confirmed.`,
      canConfirm: false,
    };
  }
  if (dup.reportedByMe) {
    return { title: "You already sent this game", detail: `${line} ${when} — waiting on ${opponentFirst}.`, canConfirm: false };
  }
  return { title: `${opponentFirst} already logged this game`, detail: `${line} ${when} — waiting on you.`, canConfirm: true };
}
