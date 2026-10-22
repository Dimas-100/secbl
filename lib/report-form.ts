// Pure logic for the one-screen report form, kept out of the component so
// vitest covers it without DOM tooling.

import { shortClubDate } from "@/lib/events";
import { RACES, startingScores, suggestedSpot, type Side } from "@/lib/race";
import { formatClubDate } from "@/lib/season";
import type { MatchStatus } from "@/lib/types";

// The games the scoreboard offers, in pill order.
export const GAME_TYPES = [
  { value: "8ball", label: "8-ball" },
  { value: "9ball", label: "9-ball" },
  { value: "10ball", label: "10-ball" },
  { value: "other", label: "Other" },
] as const;

// What a link into the scoreboard asks for (the game-counts screen's Rematch,
// lib/result-moment rematchHref): a game and race the scoreboard offers, or
// nothing — a stale or hand-edited value is ignored, never trusted. "open" is
// open play. `rematch` marks a Rematch board and `after` is the id of the
// game it rematches (a UUID, else null): the page looks that game up on the
// server and the duplicate check starts from it (ruling S4-R6).
export interface BoardSeed {
  game: string | null;
  raceTo: number | null | "open";
  rematch: boolean;
  after: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function boardParams(sp: { game?: string; race?: string; rematch?: string; after?: string }): BoardSeed {
  const game = GAME_TYPES.find((g) => g.value === sp.game)?.value ?? null;
  const race = typeof sp.race === "string" && /^\d+$/.test(sp.race) ? Number(sp.race) : null;
  const raceTo = sp.race === "open" ? "open" : (RACES.find((r) => r === race) ?? null);
  const after = typeof sp.after === "string" && UUID_RE.test(sp.after) ? sp.after : null;
  return { game, raceTo, rematch: sp.rematch === "1", after };
}

// The folded setup's one line: "8-ball · race to 5 · no spot",
// "9-ball · open race · no spot", "8-ball · race to 3 · 1 on the wire to Ana",
// and " · Oct 19" when the game is dated another day (ruling S4-R7): folded,
// the date editor is hidden, so a backdated game must still say so.
export function foldSummary(
  d: { game: string; raceTo: number | null; spot: number; spotTo: Side | null; date: string },
  opponentFirst: string,
  today: string
): string {
  const game = GAME_TYPES.find((g) => g.value === d.game)?.label ?? d.game;
  const race = d.raceTo ? `race to ${d.raceTo}` : "open race";
  const spot =
    d.raceTo && d.spot > 0 && d.spotTo ? `${d.spot} on the wire to ${d.spotTo === "you" ? "you" : opponentFirst}` : "no spot";
  const day = d.date && d.date !== today ? ` · ${shortClubDate(d.date, today)}` : "";
  return `${game} · ${race} · ${spot}${day}`;
}

// The later of two times (ISO strings), skipping any that isn't one: the
// duplicate check starts at whichever came last of the game a Rematch board
// follows and the pair's club-night table call.
export function laterTime(a: string | null | undefined, b: string | null | undefined): string | null {
  const times = [a, b].filter((t): t is string => typeof t === "string" && !Number.isNaN(Date.parse(t)));
  if (times.length === 0) return null;
  return times.reduce((x, y) => (Date.parse(y) > Date.parse(x) ? y : x));
}

// Where the server's duplicate check starts: the later of the rematched
// game's created_at (a Rematch board, ruling S4-R6) and the pair's club-night
// table call. A time after the server's own now is not trusted (an edited
// value would hide the opponent's report of the rematch, the 2026-10-15
// double count), so it is dropped and the check stays strict.
export function duplicateSince(
  since: string | null | undefined,
  calledAt: string | null | undefined,
  now: Date
): string | null {
  const trusted = typeof since === "string" && Date.parse(since) <= now.getTime() ? since : null;
  return laterTime(trusted, calledAt);
}

// The scoreboard keeps its in-progress game in localStorage under a per-member
// key, and treats a draft older than 12 hours as abandoned. The Play sheet
// reads the same key to offer "Resume", so both sides share these.
export const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function draftKey(meId: string): string {
  return `secbl:draft-game:${meId}`;
}

// Whether a point has been played on this board: the scores moved off its
// starting scores. A spotted board starts nonzero (startBoard), so 2–0 on a
// 2-game spot is untouched. The scoreboard's switch guard and the Play sheet's
// "Back to your game" row both use this, so the row shows exactly when the
// scoreboard would ask before replacing the game.
export function boardScored(draft: {
  raceTo: number | null;
  spot: number;
  spotTo: Side | null;
  you: number;
  them: number;
}): boolean {
  const start = startingScores(draft.raceTo, draft.spot, draft.spotTo);
  return draft.you !== start.you || draft.them !== start.them;
}

// What the scoreboard does when it opens with a called opponent (Play sheet,
// player page, club night) or the member picks someone else, and may already
// hold a draft. A scored game against someone else is never replaced
// silently: the form asks first.
export function openingBoard(
  draft: {
    opponentId: string | null;
    raceTo: number | null;
    spot: number;
    spotTo: Side | null;
    you: number;
    them: number;
  },
  calledId: string | undefined
): "keep" | "switch" | "ask" {
  if (!calledId || draft.opponentId === calledId) return "keep";
  if (draft.opponentId !== null && boardScored(draft)) return "ask";
  return "switch";
}

// The board a newly picked opponent gets — the same numbers the scoreboard's
// applyFormat picks: the spot their ratings suggest, scores starting from it.
// Used when "Start game" opens the scoreboard with the called opponent.
export function startBoard(
  opponentRating: number,
  myRating: number,
  raceTo: number
): { raceTo: number; spot: number; spotTo: Side | null; you: number; them: number } {
  const { spot, to } = suggestedSpot(raceTo, myRating, opponentRating);
  const start = startingScores(raceTo, spot, to);
  return { raceTo, spot, spotTo: spot > 0 ? to : null, ...start };
}

// The board a called opponent gets (Play sheet, player page, club night,
// Rematch): the game and race a Rematch link asks for, else 8-ball and the
// default race, then startBoard's spot for that race. The spot is suggested
// afresh from today's ratings, never copied from the last game.
export function seededBoard(
  seed: BoardSeed,
  opponentRating: number,
  myRating: number,
  defaultRace: number
): { game: string; raceTo: number | null; spot: number; spotTo: Side | null; you: number; them: number } {
  const game = seed.game ?? "8ball";
  if (seed.raceTo === "open") return { game, raceTo: null, spot: 0, spotTo: null, you: 0, them: 0 };
  return { game, ...startBoard(opponentRating, myRating, seed.raceTo ?? defaultRace) };
}

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
// fix); otherwise the newest game. `since` (duplicateSince) is when the pair
// was called to a club-night table, or the created_at of the game a Rematch
// board follows: a game logged at or before it cannot be this one, so a
// rematch the same evening is not flagged (spec 2026-10-20-club-night §0 #14,
// ruling S4-R6), while every report logged after it still is.
export function findDuplicate(
  rows: PairMatchRow[],
  meId: string,
  opponentId: string,
  playedAt: string,
  since: string | null = null
): DuplicateGame | null {
  const same = rows
    .filter(
      (r) =>
        r.played_at === playedAt &&
        (since === null || Date.parse(r.created_at) > Date.parse(since)) &&
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
