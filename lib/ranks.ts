// Leaderboard copy, in plain words (Play & Progress stage 5). Pure: the Ranks
// page renders what these return. Ranks themselves come only from ranking.ts.
import { PLACEMENT_GAMES } from "./home";
import { aboveOf, type RankRow } from "./ranking";

// The week's movement as an arrow; nothing when it is zero or unknown.
export function movementLabel(value: number | undefined): { text: string; tone: "win" | "loss" } | null {
  if (!value) return null;
  return value > 0 ? { text: `▲ ${value}`, tone: "win" } : { text: `▼ ${Math.abs(value)}`, tone: "loss" };
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

// Schools with no members fold into one line, in the order given.
export function emptySchoolsLine(schools: { short_name: string; member_count: number }[]): string | null {
  const empty = schools.filter((s) => s.member_count === 0).map((s) => s.short_name);
  return empty.length ? `Not here yet: ${empty.join(" · ")}` : null;
}
