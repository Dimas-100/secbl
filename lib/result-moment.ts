// The "game counts" moment (Play & Progress stage 4), pure: the headline, what
// the ladder did to one member, the at-most-three true "what changed" lines,
// which second button to show, and the rematch link. No DOM, no clock.
import type { NightStatus } from "@/lib/night";
import { boardBefore, ladderAt, rankedIds, type RankRow } from "@/lib/ranking";
import { opponentOf, type StatMatch } from "@/lib/stats";

export type RankMoveKind = "up" | "down" | "entered";

export function resultHeadline(won: boolean, opponentFirst: string, mine: number, theirs: number): string {
  return won ? `You beat ${opponentFirst} ${mine}–${theirs}` : `${opponentFirst} beat you ${theirs}–${mine}`;
}

// What one confirmed game did to my place on the ladder. "up" names the
// highest-placed member I jumped (above me before, below me after); "down"
// names the opponent when they passed me (below me before, above me after),
// else the member now directly above me if they were below me before (ruling
// S4-R7: the one who beat me, not a bystander I dropped under); "entered" is
// a first ranked game. Members unranked before are never named (they are not
// in the before ladder). null when nothing moved or I am still unranked.
export function rankMove(
  before: RankRow[],
  after: RankRow[],
  meId: string,
  opponentId: string | null = null
): { kind: RankMoveKind; to: number; otherId: string | null } | null {
  const b = rankedIds(before);
  const a = rankedIds(after);
  const to = a.indexOf(meId);
  if (to === -1) return null;
  const from = b.indexOf(meId);
  if (from === -1) return { kind: "entered", to: to + 1, otherId: null };
  if (to < from) {
    const otherId = b.slice(0, from).find((id) => a.indexOf(id) > to) ?? null;
    return { kind: "up", to: to + 1, otherId };
  }
  if (to > from) {
    // Below me before, above me now.
    const passedMe = (id: string | null) =>
      id !== null && b.indexOf(id) > from && a.indexOf(id) !== -1 && a.indexOf(id) < to;
    const above = a[to - 1];
    const otherId = passedMe(opponentId) ? opponentId : passedMe(above) ? above : null;
    return { kind: "down", to: to + 1, otherId };
  }
  return null;
}

// What this game did to my place, told on the ladder as it stood the instant
// it counted (rulings S4-R3, S4-R5): today's ladder rolled back past every
// rating change and game that came after it (ladderAt), against that ladder
// with this game taken back out (boardBefore). Games anyone played since are
// not this game's doing.
export function gameRankMove(input: {
  today: RankRow[];
  laterHistory: { profile_id: string; rating_before: number; created_at: string }[];
  laterMatches: { reporter_id: string; opponent_id: string; winner_id: string }[];
  winnerId: string;
  loserId: string;
  ratingBefore: Map<string, number>;
  meId: string;
  opponentId: string;
}): { kind: RankMoveKind; to: number; otherId: string | null } | null {
  const after = ladderAt(input.today, input.laterHistory, input.laterMatches);
  const before = boardBefore(after, input.winnerId, input.loserId, input.ratingBefore);
  return rankMove(before, after, input.meId, input.opponentId);
}

const MAX_LINES = 3;

// The "what changed" lines, in priority order, only the true ones, at most 3.
export function momentLines(input: {
  move: { kind: RankMoveKind; to: number; other: string | null } | null;
  levelBefore: number;
  levelAfter: number;
  titleUnlocked: string | null;
  achievementsUnlocked: string[];
  firstWinOver: string | null;
  winStreak: number | null;
  gameRecord: { label: string; wins: number; losses: number } | null;
}): string[] {
  const lines: string[] = [];
  const { move } = input;
  if (move) {
    if (move.kind === "entered") lines.push(`On the board at #${move.to}`);
    else if (move.kind === "up") lines.push(move.other ? `Up to #${move.to}, passing ${move.other}` : `Up to #${move.to}`);
    else lines.push(move.other ? `Down to #${move.to}, ${move.other} passed you` : `Down to #${move.to}`);
  }
  if (input.levelAfter > input.levelBefore && !input.titleUnlocked) lines.push(`Level ${input.levelAfter}`);
  if (input.titleUnlocked) lines.push(`${input.titleUnlocked} badge unlocked`);
  // Ruling S4-R2: an achievement named like the title just unlocked ("Regular")
  // would read as the same news twice; the badge line says it.
  for (const label of input.achievementsUnlocked) {
    if (label !== input.titleUnlocked) lines.push(`${label} unlocked`);
  }
  if (input.firstWinOver) lines.push(`Your first win over ${input.firstWinOver}`);
  const k = input.winStreak;
  if (k !== null && (k === 3 || k === 5 || k >= 10)) lines.push(`${k} wins in a row`);
  if (input.gameRecord) {
    const g = input.gameRecord;
    lines.push(`${g.label} record now ${g.wins}–${g.losses}`);
  }
  return lines.slice(0, MAX_LINES);
}

// Rulings S4-R1, S4-R7: "Back in line" only when a club night is open at my
// school, I am currently out, and this game was played today (its club date)
// and confirmed after the night opened. A backlog game confirmed tonight was
// not a table game, so it gets Rematch.
export function secondAction(input: {
  nightOpen: boolean;
  nightOpenedAt: string | null;
  myNightKind: NightStatus["kind"];
  confirmedAt: string;
  playedAt: string;
  today: string;
}): "rematch" | "back_in_line" {
  if (!input.nightOpen || !input.nightOpenedAt || input.myNightKind !== "out") return "rematch";
  if (input.playedAt !== input.today) return "rematch";
  const opened = Date.parse(input.nightOpenedAt);
  const confirmed = Date.parse(input.confirmedAt);
  if (Number.isNaN(opened) || Number.isNaN(confirmed)) return "rematch";
  return confirmed > opened ? "back_in_line" : "rematch";
}

// The XP row: what the game earned and where the level bar starts filling.
// A game that crossed a level fills the new one from empty; a capped game
// earned nothing, so it says so and the bar does not move.
export function xpRow(p: { xpEarned: number; xpCapped: boolean; intoLevel: number }): {
  label: string;
  barFrom: number;
} {
  if (p.xpCapped) return { label: "No XP · weekly limit", barFrom: p.intoLevel };
  return { label: `+${p.xpEarned} XP`, barFrom: Math.max(0, p.intoLevel - p.xpEarned) };
}

// A rating change with its sign: "+14", or "−9" with a true minus (U+2212).
export function signedChange(delta: number): string {
  return `${delta < 0 ? "−" : "+"}${Math.abs(delta)}`;
}

// "Your first win over {first}": this game is a win, and no game before it in
// play order (ruling S3-R7) was a win over the same opponent. newestFirst is
// sorted with byPlayOrder, so "before" is everything after it in the list.
export function firstWinOver(newestFirst: StatMatch[], meId: string, matchId: string): boolean {
  const i = newestFirst.findIndex((m) => m.id === matchId);
  if (i === -1 || newestFirst[i].winner_id !== meId) return false;
  const them = opponentOf(newestFirst[i], meId);
  return !newestFirst.slice(i + 1).some((m) => m.winner_id === meId && opponentOf(m, meId) === them);
}

// The scoreboard for the same opponent, game and race. `after` is the game
// being rematched (ruling S4-R6): the board's duplicate check ignores that
// game and anything logged before it, and still catches any report of the
// rematch, whenever the board was opened.
export function rematchHref(m: { opponentId: string; gameType: string; raceTo: number | null; matchId: string }): string {
  const race = m.raceTo === null ? "open" : String(m.raceTo);
  return `/matches/new?opponent=${m.opponentId}&game=${m.gameType}&race=${race}&rematch=1&after=${m.matchId}`;
}
