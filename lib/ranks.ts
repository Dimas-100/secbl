// Leaderboard copy, in plain words (Play & Progress stage 5). Pure: the Ranks
// page renders what these return. Ranks themselves come only from ranking.ts.
import { PLACEMENT_GAMES } from "./home";
import { aboveOf, type RankRow } from "./ranking";

// The week's movement as an arrow; nothing when it is zero or unknown.
// `spoken` is what a screen reader hears in place of the arrow.
export function movementLabel(
  value: number | undefined
): { text: string; spoken: string; tone: "win" | "loss" } | null {
  if (!value) return null;
  return value > 0
    ? { text: `▲ ${value}`, spoken: `up ${value} this week`, tone: "win" }
    : { text: `▼ ${Math.abs(value)}`, spoken: `down ${Math.abs(value)} this week`, tone: "loss" };
}

// 1 to 9 confirmed games are still placing; none, or ten and up, show no tag.
export function placingTag(played: number): string | null {
  return played >= 1 && played < PLACEMENT_GAMES ? `placing ${played}/${PLACEMENT_GAMES}` : null;
}

// Your gap to the member directly above, over the rows given (the visible
// scope, so a school-only list talks about its own order). null for #1, an
// unplaced member or an id that isn't in the rows.
export function gapLine(rows: RankRow[], id: string): string | null {
  const above = aboveOf(rows, id);
  if (!above) return null;
  if (above.gap <= 0) return `level on rating with #${above.rank}`;
  return `${above.gap} ${above.gap === 1 ? "pt" : "pts"} to #${above.rank}`;
}

// One predicate for the Schools tab: a school with members holds a number,
// every other school (zero, null or unreadable count) is "not here yet".
export function schoolHasMembers(s: { member_count: unknown }): boolean {
  return Number(s.member_count) > 0;
}

// Schools with no members fold into one line, alphabetical so the line stays put.
export function emptySchoolsLine(schools: { short_name: string; member_count: unknown }[]): string | null {
  const empty = schools
    .filter((s) => !schoolHasMembers(s))
    .map((s) => s.short_name)
    .sort((a, b) => a.localeCompare(b));
  return empty.length ? `Not here yet: ${empty.join(" · ")}` : null;
}
