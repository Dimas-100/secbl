// Race formats and spots (docs/superpowers/specs/2026-10-06-live-club-design.md
// §7–8). Pure: the live scoreboard, the report action and the match rows all
// read the same rules.
//
// A "spot" is games on the wire: the receiver starts the race already holding
// that many. Scores are kept as the scoreboard shows them (spot included), so
// the winner is always the higher score and nothing downstream changes.
import { submitState } from "@/lib/report-form";

export const RACES = [3, 5, 7, 9] as const;
export const MAX_SCORE = 99;
export type Side = "you" | "them";

export interface RaceState {
  you: number;
  them: number;
  // null = open play: no finish line, scores just have to differ.
  raceTo: number | null;
  spot: number;
  spotTo: Side | null;
}

export function startingScores(
  raceTo: number | null,
  spot: number,
  spotTo: Side | null
): { you: number; them: number } {
  if (!raceTo || !spotTo || spot <= 0) return { you: 0, them: 0 };
  return spotTo === "you" ? { you: spot, them: 0 } : { you: 0, them: spot };
}

// Fargo-style handicap: a 100-point gap is 2:1 odds, so the weaker player
// should need raceTo/odds games. Rounded up, so the spot errs on the side of
// the better player; the rest of the race is the spot, kept below raceTo.
export function suggestedSpot(
  raceTo: number,
  myRating: number,
  theirRating: number
): { spot: number; to: Side | null } {
  const gap = Math.abs(myRating - theirRating);
  const odds = Math.pow(2, gap / 100);
  const weakerNeeds = Math.max(1, Math.ceil(raceTo / odds));
  const spot = Math.min(raceTo - 1, Math.max(0, raceTo - weakerNeeds));
  if (spot === 0 || myRating === theirRating) return { spot: 0, to: null };
  return { spot, to: myRating > theirRating ? "them" : "you" };
}

// 0..1 for the rail under a player's number; nothing to fill in open play.
export function raceProgress(score: number, raceTo: number | null): number {
  if (!raceTo) return 0;
  return Math.min(1, Math.max(0, score / raceTo));
}

export function finished(s: RaceState): Side | null {
  if (!s.raceTo) return null;
  if (s.you >= s.raceTo) return "you";
  if (s.them >= s.raceTo) return "them";
  return null;
}

export function canIncrement(s: RaceState, who: Side): boolean {
  if (finished(s)) return false;
  if (s.raceTo) return s[who] < s.raceTo;
  return s[who] < MAX_SCORE;
}

// The receiver never drops below the games they were given.
export function canDecrement(s: RaceState, who: Side): boolean {
  const floor = s.spotTo === who ? s.spot : 0;
  return s[who] > floor;
}

// The long form, for the scoreboard and the confirm row.
export function formatLabel(raceTo: number | null, spot: number, spotToName: string | null): string | null {
  if (!raceTo) return null;
  if (spot > 0 && spotToName) return `Race to ${raceTo} · ${spot} on the wire to ${spotToName}`;
  return `Race to ${raceTo}`;
}

// The short form, for a match row's meta line.
export function formatShort(raceTo: number | null, spot: number): string | null {
  if (!raceTo) return null;
  return spot > 0 ? `race to ${raceTo} · ${spot} spot` : `race to ${raceTo}`;
}

export function needLine(s: RaceState, theirFirstName: string): string {
  if (!s.raceTo) return "Open play";
  const done = finished(s);
  if (done === "you") return `You win ${s.you}–${s.them}`;
  if (done === "them") return `${theirFirstName} wins ${s.them}–${s.you}`;
  return `You need ${s.raceTo - s.you} · ${theirFirstName} needs ${s.raceTo - s.them}`;
}

// The one server-side rule for a submitted result, shared by match reporting
// and admin dispute resolution so the two can never disagree with the DB's
// check constraints. Null when the result is sound; otherwise a sentence the
// person can act on. Scores include the spot.
export function validateResult(r: {
  reporterId: string;
  opponentId: string;
  reporterScore: number;
  opponentScore: number;
  raceTo: number | null;
  spot: number;
  spotTo: string | null;
}): string | null {
  if (r.reporterScore === r.opponentScore) return "Scores can't be equal";
  if ((r.spot === 0) !== (r.spotTo === null)) return "That spot doesn't fit the race";
  if (r.spotTo !== null && r.spotTo !== r.reporterId && r.spotTo !== r.opponentId) {
    return "That spot doesn't fit the race";
  }
  if (r.raceTo === null) return r.spot > 0 ? "A spot needs a race" : null;
  if (r.spot >= r.raceTo) return "That spot doesn't fit the race";
  const hi = Math.max(r.reporterScore, r.opponentScore);
  const lo = Math.min(r.reporterScore, r.opponentScore);
  if (hi !== r.raceTo || lo >= r.raceTo) return `That race isn't finished yet — first to ${r.raceTo}`;
  const receiverScore = r.spotTo === r.reporterId ? r.reporterScore : r.spotTo === r.opponentId ? r.opponentScore : null;
  if (receiverScore !== null && receiverScore < r.spot) {
    return `The spot receiver can't finish below their ${r.spot}-game spot`;
  }
  return null;
}

export function raceSubmitState(
  s: RaceState,
  opponentName: string | null
): { label: string; disabled: boolean; reason: string | null } {
  if (!s.raceTo) return submitState(s.you, s.them, opponentName);
  if (!opponentName) return { label: "Send to confirm", disabled: true, reason: "Pick your opponent" };
  if (!finished(s)) {
    return { label: "Send to confirm", disabled: true, reason: `Race on — first to ${s.raceTo}` };
  }
  return { label: `Send to ${opponentName} to confirm`, disabled: false, reason: null };
}
