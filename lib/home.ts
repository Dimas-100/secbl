// Home's copy decisions (spec 2026-10-21-play-and-progress §2), kept pure so
// vitest covers every branch: placement, the last-five dots, the XP note and
// the one Next line on the progress card, and the line under a result to
// confirm.

import { GAME_LABEL } from "@/lib/identity";
import { nextBadge, type LevelInfo } from "@/lib/levels";
import { formatLabel } from "@/lib/race";

// Confirmed games before a rating counts as set ("placement").
export const PLACEMENT_GAMES = 10;

export function placementLeft(played: number): number {
  return Math.max(0, PLACEMENT_GAMES - played);
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

// XP to go reads like the profile's ("3,450"); rating gaps stay plain.
const xpCount = (n: number) => n.toLocaleString("en-US");
const pts = (gap: number) => `${gap} ${gap === 1 ? "pt" : "pts"}`;

// The newest `n` results as W/L, oldest first, so the newest sits on the right.
// Games played, for Home's progress card. The leaderboard view is the source,
// so placement agrees with the Ranks tab. When that read failed or the
// member's row is missing, the profile's own count stands in (a veteran must
// never be shown "Play your first game") and rank is unknown, so the card
// leaves its Next line out rather than guess it.
export function playedFrom(
  myRow: { wins: number; losses: number } | undefined,
  profileCount: number | null | undefined
): { played: number; rankKnown: boolean } {
  if (myRow) return { played: myRow.wins + myRow.losses, rankKnown: true };
  return { played: Number(profileCount ?? 0), rankKnown: false };
}

export function formDots(newestFirst: { winner_id: string }[], meId: string, n = 5): ("W" | "L")[] {
  return newestFirst
    .slice(0, n)
    .map((m): "W" | "L" => (m.winner_id === meId ? "W" : "L"))
    .reverse();
}

// The progress card's one goal, first that applies: finish placement, pass
// the member directly above, hold #1 over #2, then the next badge.
export function nextLine(input: {
  played: number;
  above: { name: string; rank: number; gap: number } | null;
  lead: { name: string; gap: number } | null;
  badge: { title: string; xpToGo: number } | null;
}): string | null {
  const left = placementLeft(input.played);
  if (left > 0) return `${left} more ${left === 1 ? "game" : "games"} to finish placement`;
  if (input.above) {
    const { name, rank, gap } = input.above;
    return `Next: pass ${firstName(name)} for #${rank} · ${gap === 0 ? "level on rating" : pts(gap)}`;
  }
  if (input.lead) {
    const { name, gap } = input.lead;
    return gap === 0
      ? `You're #1 · level on rating with ${firstName(name)}`
      : `You're #1 · ${pts(gap)} ahead of ${firstName(name)}`;
  }
  if (input.badge) return `Next: ${input.badge.title} badge · ${xpCount(input.badge.xpToGo)} XP`;
  return null;
}

// Over the first-game card's faces. playFaces fills from other schools when
// yours has fewer than four other members, so the school is named only when
// every face shown is a schoolmate.
export function facesEyebrow(
  faceSchoolIds: (string | null)[],
  mySchoolId: string | null,
  school: string | null
): string {
  const allSchoolmates =
    school !== null &&
    mySchoolId !== null &&
    faceSchoolIds.length > 0 &&
    faceSchoolIds.every((id) => id === mySchoolId);
  return allSchoolmates ? `Play someone from ${school}` : "Play someone now";
}

// Beside the level bar: the XP to the next title, or for a Legend (no title
// left) the XP into the current level, as the profile shows it.
export function xpNote(level: LevelInfo, xpTotal: number): string {
  const badge = nextBadge(level, xpTotal);
  if (!badge) return `${xpCount(level.intoLevel)} / ${xpCount(level.needed)} XP`;
  return `${xpCount(badge.xpToGo)} XP to ${badge.title}`;
}

// Under "{name} logged a game" in Home's needs-you stack: who won and how,
// from the confirmer's side. The winner is the reporter's first name or You,
// the score high–low, then the game and the race as the confirm row always
// showed them; open play has no race.
export function confirmMeta(m: {
  reporterName: string;
  reporterWon: boolean;
  reporterScore: number;
  opponentScore: number;
  gameType: string;
  raceTo: number | null;
  spot: number;
  spotToMe: boolean;
}): string {
  const reporter = firstName(m.reporterName);
  const hi = Math.max(m.reporterScore, m.opponentScore);
  const lo = Math.min(m.reporterScore, m.opponentScore);
  return [
    `${m.reporterWon ? reporter : "You"} won ${hi}–${lo}`,
    GAME_LABEL[m.gameType] ?? m.gameType,
    formatLabel(m.raceTo, m.spot, m.spotToMe ? "you" : reporter),
  ]
    .filter(Boolean)
    .join(" · ");
}
