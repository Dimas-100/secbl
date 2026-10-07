import { describe, expect, it } from "vitest";
import {
  POINTS_LOSS,
  POINTS_WIN,
  daysBetween,
  daysLeft,
  formatClubDate,
  inSeason,
  seasonChampion,
  seasonCountdownLabel,
  seasonProgress,
  seasonStandings,
  type SeasonMatch,
} from "@/lib/season";

const season = { starts_on: "2026-08-20", ends_on: "2026-12-12" };
const members = [
  { id: "a", display_name: "Ana" },
  { id: "b", display_name: "Ben" },
  { id: "c", display_name: "Cy" },
  { id: "d", display_name: "Dee" },
];
let n = 0;
const game = (winner: string, loser: string, played_at = "2026-09-01"): SeasonMatch => ({
  id: `m${++n}`,
  reporter_id: winner,
  opponent_id: loser,
  winner_id: winner,
  played_at,
});

describe("inSeason", () => {
  it("is inclusive at both ends and a day earlier is out", () => {
    expect(inSeason("2026-08-20", season)).toBe(true);
    expect(inSeason("2026-12-12", season)).toBe(true);
    expect(inSeason("2026-08-19", season)).toBe(false);
    expect(inSeason("2026-12-13", season)).toBe(false);
  });
  it("has no end while ends_on is null", () => {
    expect(inSeason("2030-01-01", { starts_on: "2026-08-20", ends_on: null })).toBe(true);
  });
});

describe("seasonStandings", () => {
  it("scores 3 a win and 1 a loss and lists everyone, ranked", () => {
    const rows = seasonStandings([game("a", "b"), game("a", "c"), game("b", "c")], members, season);
    expect(rows.map((r) => [r.id, r.points, r.wins, r.losses])).toEqual([
      ["a", 2 * POINTS_WIN, 2, 0],
      ["b", POINTS_WIN + POINTS_LOSS, 1, 1],
      ["c", 2 * POINTS_LOSS, 0, 2],
      ["d", 0, 0, 0],
    ]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(rows[0].played).toBe(2);
  });

  it("ranks more wins above on equal points", () => {
    // a: 3–0 = 9 pts. b: 2–3 = 9 pts. d: 2–3 = 9 pts. Same points, a has
    // more wins; b and d tie on wins and d beat b twice.
    const rows = seasonStandings(
      [game("a", "d"), game("a", "d"), game("a", "d"), game("b", "c"), game("b", "c"), game("c", "b"), game("d", "b"), game("d", "b")],
      members,
      season
    );
    expect(rows.slice(0, 3).map((r) => [r.id, r.wins, r.losses, r.points])).toEqual([
      ["a", 3, 0, 9],
      ["d", 2, 3, 9],
      ["b", 2, 3, 9],
    ]);
  });

  it("breaks equal points and wins by head-to-head, then name", () => {
    // a and b both 3–2 (11 pts); they split their two meetings → by name.
    const split = [
      game("b", "a"), game("a", "c"), game("b", "c"), game("a", "d"), game("b", "d"), game("a", "b"), game("c", "a"), game("d", "b"),
    ];
    expect(seasonStandings(split, members, season).slice(0, 2).map((r) => r.id)).toEqual(["a", "b"]);
    // Same totals, but b beat a both times → b first.
    const decided = [
      game("b", "a"), game("b", "a"), game("a", "c"), game("a", "d"), game("a", "c"), game("b", "c"), game("d", "b"), game("d", "b"),
    ];
    const rows = seasonStandings(decided, members, season);
    expect(rows.slice(0, 2).map((r) => [r.id, r.wins, r.losses, r.points])).toEqual([
      ["b", 3, 2, 11],
      ["a", 3, 2, 11],
    ]);
  });

  it("ignores games outside the season and players who are not members", () => {
    const rows = seasonStandings([game("a", "b", "2026-08-01"), game("zz", "a")], members, season);
    expect(rows.every((r) => r.points === 0 && r.played === 0)).toBe(true);
  });

  it("names the champion as the top row with games, or null", () => {
    expect(seasonChampion(seasonStandings([], members, season))).toBeNull();
    expect(seasonChampion(seasonStandings([game("c", "a")], members, season))?.id).toBe("c");
  });
});

describe("dates", () => {
  it("counts whole days between club dates", () => {
    expect(daysBetween("2026-08-20", "2026-08-27")).toBe(7);
    expect(daysBetween("2026-12-12", "2026-12-05")).toBe(-7);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });
  it("daysLeft, progress and the label", () => {
    expect(daysLeft(season, "2026-12-05")).toBe(7);
    expect(daysLeft({ ...season, ends_on: null }, "2026-12-05")).toBeNull();
    expect(seasonProgress(season, "2026-08-20")).toBe(0);
    expect(seasonProgress(season, "2026-12-12")).toBe(1);
    expect(seasonProgress(season, "2027-01-01")).toBe(1);
    expect(seasonProgress({ ...season, ends_on: null }, "2026-09-01")).toBeNull();
    expect(formatClubDate("2026-08-20")).toBe("Aug 20");
    const open = { ...season, status: "open" as const };
    expect(seasonCountdownLabel(open, "2026-12-05")).toBe("7 days left");
    expect(seasonCountdownLabel(open, "2026-12-11")).toBe("1 day left");
    expect(seasonCountdownLabel(open, "2026-12-12")).toBe("Ends today");
    expect(seasonCountdownLabel(open, "2026-12-20")).toBe("Ended Dec 12");
    expect(seasonCountdownLabel({ ...open, ends_on: null }, "2026-09-01")).toBe("Started Aug 20");
    expect(seasonCountdownLabel({ ...season, status: "closed" }, "2027-01-01")).toBe("Ended Dec 12");
  });
});
