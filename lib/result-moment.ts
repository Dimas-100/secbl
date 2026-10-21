// The "game counts" moment (Play & Progress stage 4), pure: the headline, what
// the ladder did to one member, the at-most-three true "what changed" lines,
// which second button to show, and the rematch link. No DOM, no clock.
import { rankedIds, type RankRow } from "@/lib/ranking";

export type RankMoveKind = "up" | "down" | "entered";

export function resultHeadline(won: boolean, opponentFirst: string, mine: number, theirs: number): string {
  return won ? `You beat ${opponentFirst} ${mine}–${theirs}` : `${opponentFirst} beat you ${theirs}–${mine}`;
}

// What one confirmed game did to my place on the ladder. "up" names the
// highest-placed member I jumped (above me before, below me after); "down"
// names the member now directly above me who was below me before; "entered"
// is a first ranked game. Members unranked before are never named (they are
// not in the before ladder). null when nothing moved or I am still unranked.
export function rankMove(
  before: RankRow[],
  after: RankRow[],
  meId: string
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
    const above = a[to - 1];
    return { kind: "down", to: to + 1, otherId: b.indexOf(above) > from ? above : null };
  }
  return null;
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
  for (const label of input.achievementsUnlocked) lines.push(`${label} unlocked`);
  if (input.firstWinOver) lines.push(`Your first win over ${input.firstWinOver}`);
  const k = input.winStreak;
  if (k !== null && (k === 3 || k === 5 || k >= 10)) lines.push(`${k} wins in a row`);
  if (input.gameRecord) {
    const g = input.gameRecord;
    lines.push(`${g.label} record now ${g.wins}–${g.losses}`);
  }
  return lines.slice(0, MAX_LINES);
}

// Ruling S4-R1: "Back in line" only when a club night is open at my school,
// I am currently out, and this game was confirmed after the night opened.
export function secondAction(input: {
  nightOpen: boolean;
  nightOpenedAt: string | null;
  myNightKind: string;
  confirmedAt: string;
}): "rematch" | "back_in_line" {
  if (!input.nightOpen || !input.nightOpenedAt || input.myNightKind !== "out") return "rematch";
  const opened = Date.parse(input.nightOpenedAt);
  const confirmed = Date.parse(input.confirmedAt);
  if (Number.isNaN(opened) || Number.isNaN(confirmed)) return "rematch";
  return confirmed > opened ? "back_in_line" : "rematch";
}

export function rematchHref(m: { opponentId: string; gameType: string; raceTo: number | null }): string {
  const race = m.raceTo === null ? "open" : String(m.raceTo);
  return `/matches/new?opponent=${m.opponentId}&game=${m.gameType}&race=${race}&rematch=1`;
}
