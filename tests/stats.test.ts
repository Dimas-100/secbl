import { describe, expect, it } from "vitest";
import { clubMonthStart } from "@/lib/events";
import {
  bestWin,
  byPlayOrder,
  currentStreak,
  groupByPlayedDate,
  headToHead,
  labelPlayedDate,
  longestWinStreak,
  movementSince,
  peakRating,
  ratingChangeSince,
  seasonLabel,
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
  it("adds the year when the date isn't in today's club year", () => {
    expect(labelPlayedDate("2025-12-12", "2026-10-21")).toBe("Fri, Dec 12, 2025");
    expect(labelPlayedDate("2026-01-02", "2026-12-30")).toBe("Fri, Jan 2");
    // Yesterday across New Year is still "Yesterday".
    expect(labelPlayedDate("2025-12-31", "2026-01-01")).toBe("Yesterday");
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
  it("counts this club month only: a game late on Sep 30 in New York is September's", () => {
    // 2026-10-01T02:00Z is Sep 30, 10:00 PM EDT.
    const late = [{ rating_before: 450, rating_after: 470, created_at: "2026-10-01T02:00:00Z" }];
    const october = clubMonthStart(new Date("2026-10-21T15:00:00Z"));
    expect(ratingChangeSince(late, october, 470)).toBeNull();
    const early = [...late, { rating_before: 470, rating_after: 482, created_at: "2026-10-01T05:00:00Z" }];
    expect(ratingChangeSince(early, october, 482)).toBe(12);
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

describe("seasonLabel", () => {
  it("names the club season from a club calendar date", () => {
    expect(seasonLabel("2026-10-06")).toBe("Fall 2026");
    expect(seasonLabel("2026-08-01")).toBe("Fall 2026");
    expect(seasonLabel("2027-01-15")).toBe("Spring 2027");
    expect(seasonLabel("2027-05-31")).toBe("Spring 2027");
    expect(seasonLabel("2027-06-10")).toBe("Summer 2027");
  });
});

describe("longestWinStreak", () => {
  it("is the longest run of wins anywhere in the history", () => {
    const h = [
      m("1", "x", "me", "x"),
      m("2", "me", "me", "x"),
      m("3", "me", "me", "x"),
      m("4", "me", "me", "x"),
      m("5", "x", "me", "x"),
      m("6", "me", "me", "x"),
    ];
    expect(longestWinStreak(h, "me")).toBe(3);
  });
  it("is 0 with no matches or no wins", () => {
    expect(longestWinStreak([], "me")).toBe(0);
    expect(longestWinStreak([m("1", "x", "me", "x")], "me")).toBe(0);
  });
});

describe("byPlayOrder (ruling S3-R7)", () => {
  const g = (id: string, played_at: string, created_at: string) => ({ id, played_at, created_at });

  it("puts the newest played first, then the newest logged, then the higher id", () => {
    const ms = [
      g("a", "2026-10-01", "2026-10-01T20:00:00Z"),
      g("b", "2026-10-03", "2026-10-03T19:00:00Z"),
      g("c", "2026-10-03", "2026-10-03T21:00:00Z"),
      g("e", "2026-10-02", "2026-10-02T20:00:00Z"),
      g("d", "2026-10-02", "2026-10-02T20:00:00Z"),
    ];
    expect([...ms].sort(byPlayOrder).map((m) => m.id)).toEqual(["c", "b", "e", "d", "a"]);
  });

  it("orders by the day played, not by when it was logged or confirmed", () => {
    // Logged a week later for a game played on the 1st: it is still older.
    const late = g("late", "2026-10-01", "2026-10-08T12:00:00Z");
    const recent = g("recent", "2026-10-05", "2026-10-05T12:00:00Z");
    expect([late, recent].sort(byPlayOrder).map((m) => m.id)).toEqual(["recent", "late"]);
  });

  it("keeps PostgREST microseconds in order within one millisecond", () => {
    const a = g("a", "2026-10-03", "2026-10-03T21:00:00.123456+00:00");
    const b = g("b", "2026-10-03", "2026-10-03T21:00:00.123401+00:00");
    expect([b, a].sort(byPlayOrder).map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("is 0 only for the same game", () => {
    const a = g("a", "2026-10-03", "2026-10-03T21:00:00Z");
    expect(byPlayOrder(a, { ...a })).toBe(0);
  });

  it("reads a batch confirmed in reverse play order as played", () => {
    // Played W, W, L (oldest to newest) and confirmed L first: newest
    // confirmed first the list is W, W, L, which reads "won the last 2".
    const played = (id: string, winner: string, day: string) => ({
      ...m(id, winner, "me", "x", { confirmed_at: null }),
      played_at: day,
      created_at: `${day}T20:00:00Z`,
    });
    const w1 = played("w1", "me", "2026-10-01");
    const w2 = played("w2", "me", "2026-10-02");
    const l3 = played("l3", "x", "2026-10-03");
    const newestConfirmedFirst = [w1, w2, l3];
    const byPlay = [...newestConfirmedFirst].sort(byPlayOrder);
    expect(byPlay.map((x) => x.id)).toEqual(["l3", "w2", "w1"]);
    expect(currentStreak(byPlay, "me")).toEqual({ kind: "L", length: 1 });
    expect(currentStreak(newestConfirmedFirst, "me")).toEqual({ kind: "W", length: 2 }); // the old, untrue read
  });
});
