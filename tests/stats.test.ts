import { describe, expect, it } from "vitest";
import {
  bestWin,
  currentStreak,
  groupByPlayedDate,
  headToHead,
  labelPlayedDate,
  movementSince,
  peakRating,
  ratingChangeSince,
  sparklinePoints,
  winRate,
  type StatMatch,
} from "@/lib/stats";

describe("labelPlayedDate / groupByPlayedDate", () => {
  it("labels today, yesterday and older dates", () => {
    expect(labelPlayedDate("2026-10-05", "2026-10-05")).toBe("Today");
    expect(labelPlayedDate("2026-10-04", "2026-10-05")).toBe("Yesterday");
    expect(labelPlayedDate("2026-10-03", "2026-10-05")).toBe("Sat, Oct 3");
    expect(labelPlayedDate("2026-09-30", "2026-10-01")).toBe("Yesterday");
  });
  it("groups consecutive matches by date in order", () => {
    const groups = groupByPlayedDate(
      [
        { id: 1, played_at: "2026-10-05" },
        { id: 2, played_at: "2026-10-05" },
        { id: 3, played_at: "2026-10-03" },
      ],
      "2026-10-05"
    );
    expect(groups.map((g) => [g.label, g.matches.length])).toEqual([
      ["Today", 2],
      ["Sat, Oct 3", 1],
    ]);
  });
});

const m = (
  id: string,
  winner: string,
  a: string,
  b: string,
  extra: Partial<StatMatch> = {}
): StatMatch => ({
  id,
  reporter_id: a,
  opponent_id: b,
  winner_id: winner,
  reporter_score: 5,
  opponent_score: 3,
  confirmed_at: "2026-10-01T00:00:00Z",
  ...extra,
});

describe("currentStreak", () => {
  it("counts consecutive results from the newest match", () => {
    const matches = [m("1", "me", "me", "x"), m("2", "me", "x", "me"), m("3", "x", "me", "x")];
    expect(currentStreak(matches, "me")).toEqual({ kind: "W", length: 2 });
  });
  it("reports a losing streak", () => {
    const matches = [m("1", "x", "me", "x"), m("2", "me", "me", "x")];
    expect(currentStreak(matches, "me")).toEqual({ kind: "L", length: 1 });
  });
  it("is null with no matches", () => {
    expect(currentStreak([], "me")).toBeNull();
  });
});

describe("winRate", () => {
  it("rounds to a whole percent and handles zero", () => {
    expect(winRate(5, 2)).toBe(71);
    expect(winRate(0, 0)).toBeNull();
  });
});

describe("ratingChangeSince", () => {
  const history = [
    { rating_before: 450, rating_after: 470, created_at: "2026-09-01T00:00:00Z" },
    { rating_before: 470, rating_after: 460, created_at: "2026-09-20T00:00:00Z" },
    { rating_before: 460, rating_after: 490, created_at: "2026-10-03T00:00:00Z" },
  ];
  it("is current minus the rating before the first change in the window", () => {
    expect(ratingChangeSince(history, new Date("2026-09-15T00:00:00Z"), 490)).toBe(20);
  });
  it("is null when nothing happened in the window", () => {
    expect(ratingChangeSince(history, new Date("2026-10-04T00:00:00Z"), 490)).toBeNull();
  });
});

describe("peakRating", () => {
  it("is the best of history and current, with the date it was reached", () => {
    const history = [
      { rating_before: 450, rating_after: 520, created_at: "2026-09-01T00:00:00Z" },
      { rating_before: 520, rating_after: 480, created_at: "2026-09-20T00:00:00Z" },
    ];
    expect(peakRating(history, 480)).toEqual({ rating: 520, at: "2026-09-01T00:00:00Z" });
    expect(peakRating([], 450)).toEqual({ rating: 450, at: null });
  });
});

describe("sparklinePoints", () => {
  it("maps ratings onto the box, newest on the right, with a flat line for one point", () => {
    expect(sparklinePoints([450], 100, 40)).toEqual([
      [0, 20],
      [100, 20],
    ]);
    const pts = sparklinePoints([400, 500, 450], 100, 40);
    expect(pts[0]).toEqual([0, 40]);
    expect(pts[1]).toEqual([50, 0]);
    expect(pts[2]).toEqual([100, 20]);
  });
  it("is empty for no data", () => {
    expect(sparklinePoints([], 100, 40)).toEqual([]);
  });
});

describe("bestWin", () => {
  it("is the win over the highest-rated opponent", () => {
    const ratings = { a: 600, b: 700, c: 800 };
    const matches = [
      m("1", "me", "me", "a"),
      m("2", "me", "b", "me"),
      m("3", "c", "me", "c"), // lost to the strongest
    ];
    expect(bestWin(matches, "me", ratings)).toEqual({ matchId: "2", opponentId: "b", rating: 700 });
    expect(bestWin([m("4", "x", "me", "x")], "me", { x: 1 })).toBeNull();
  });
});

describe("headToHead", () => {
  it("counts wins and losses against one opponent only", () => {
    const matches = [
      m("1", "me", "me", "them"),
      m("2", "them", "them", "me"),
      m("3", "me", "me", "other"),
    ];
    expect(headToHead(matches, "me", "them")).toEqual({ wins: 1, losses: 1 });
  });
});

describe("movementSince", () => {
  it("gives each player current minus rating_before of their first change in the window", () => {
    const history = [
      { profile_id: "a", rating_before: 450, rating_after: 470, created_at: "2026-10-01T00:00:00Z" },
      { profile_id: "a", rating_before: 470, rating_after: 480, created_at: "2026-10-03T00:00:00Z" },
      { profile_id: "b", rating_before: 500, rating_after: 490, created_at: "2026-10-02T00:00:00Z" },
    ];
    const moves = movementSince(history, { a: 480, b: 490, c: 450 });
    expect(moves).toEqual({ a: 30, b: -10 });
  });
});
