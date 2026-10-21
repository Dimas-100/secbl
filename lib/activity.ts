// Derived feed moments (docs/superpowers/specs/2026-10-06-seasons-feed-live-design.md §2):
// computed once, right after a confirmation, from the same pure inputs the
// profile uses, then stored with the match that caused them so a void takes
// them away again. Writing lives in lib/activity-write.ts (server only).
import { TITLES, type LevelInfo, type TitleName } from "@/lib/levels";
import { rankedIds, type RankRow } from "@/lib/ranking";
import { currentStreak, type StatMatch } from "@/lib/stats";

// Ladder passes are only a moment near the top; lower down they happen
// every night and would drown the feed.
export const PASS_TOP = 10;

export function isStreakMark(n: number): boolean {
  return n === 3 || n === 5 || (n >= 10 && n % 5 === 0);
}

const titleIndex = (t: TitleName) => TITLES.findIndex((x) => x.name === t);

// `before` is the level replayed without the match, `after` with it.
export function badgeMoment(before: LevelInfo, after: LevelInfo): { title: TitleName; level: number } | null {
  if (titleIndex(after.title) <= titleIndex(before.title)) return null;
  return { title: after.title, level: after.level };
}

export function streakMoment(newestFirst: StatMatch[], winnerId: string): { length: number } | null {
  const s = currentStreak(newestFirst, winnerId);
  if (!s || s.kind !== "W" || !isStreakMark(s.length)) return null;
  return { length: s.length };
}

// The winner moved up into the top PASS_TOP; `otherId` is the highest-placed
// player they jumped over. Only members with a confirmed game hold a rank, so
// jumping someone who has not played is not a pass (lib/ranking.ts).
export function passMoment(
  before: RankRow[],
  after: RankRow[],
  winnerId: string
): { rank: number; otherId: string } | null {
  const b = rankedIds(before);
  const a = rankedIds(after);
  const rb = b.indexOf(winnerId) + 1;
  const ra = a.indexOf(winnerId) + 1;
  if (rb === 0 || ra === 0 || ra >= rb || ra > PASS_TOP) return null;
  const belowNow = new Set(a.slice(ra));
  const jumped = b.slice(0, rb - 1).filter((id) => belowNow.has(id));
  if (jumped.length === 0) return null;
  return { rank: ra, otherId: jumped[0] };
}
