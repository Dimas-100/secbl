import { describe, expect, it } from "vitest";
import { clubMonthStart } from "@/lib/events";
import { formDots } from "@/lib/home";
import { STARTING_RATING } from "@/lib/rating";
import { byPlayOrder, longestWinStreak } from "@/lib/stats";
import {
  bestWinMarker,
  chartAriaLabel,
  chartChangeLabel,
  chartEmptyLabel,
  chartSeries,
  formSummary,
  gameSplits,
  monthSentence,
  rankAsOf,
  ratingSplits,
  rivalLine,
  rivals,
  type YouMatch,
} from "@/lib/you";

const ME = "me";
let seq = 0;
function match(opp: string, iWon: boolean, game = "8ball", playedAt = "2026-10-01", iReported = true): YouMatch {
  seq += 1;
  return {
    id: `m${seq}`,
    reporter_id: iReported ? ME : opp,
    opponent_id: iReported ? opp : ME,
    winner_id: iWon ? ME : opp,
    game_type: game,
    played_at: playedAt,
    confirmed_at: "2026-10-01T00:00:00Z",
  };
}
const many = (n: number, opp: string, iWon: boolean, game: string) =>
  Array.from({ length: n }, () => match(opp, iWon, game));

describe("formSummary", () => {
  it("counts wins in the dots", () => {
    expect(formSummary(["W", "W", "L"])).toBe("won 2 of your last 3");
    expect(formSummary(["L", "L"])).toBe("won 0 of your last 2");
  });
  it("says their on someone else's page", () => {
    expect(formSummary(["W", "L"], "their")).toBe("won 1 of their last 2");
  });
});

describe("gameSplits", () => {
  it("lists the most-played game first with a rounded percent", () => {
    const ms = [...many(2, "a", true, "9ball"), ...many(3, "a", false, "9ball"), ...many(9, "b", true, "8ball"), ...many(3, "b", false, "8ball")];
    const out = gameSplits(ms, ME);
    expect(out).toEqual([
      { game: "8ball", label: "8-ball", wins: 9, losses: 3, pct: 75 },
      { game: "9ball", label: "9-ball", wins: 2, losses: 3, pct: 40 },
    ]);
  });

  it("rounds the percent", () => {
    const ms = [...many(2, "a", true, "10ball"), ...many(1, "a", false, "10ball")];
    expect(gameSplits(ms, ME)[0]).toMatchObject({ label: "10-ball", pct: 67 });
  });

  it("falls back to the raw key for an unknown game and handles no games", () => {
    expect(gameSplits([match("a", true, "snooker")], ME)[0].label).toBe("snooker");
    expect(gameSplits([], ME)).toEqual([]);
  });
});

describe("ratingSplits", () => {
  it("splits by the opponent's rating before the match, leaving equal ones out", () => {
    const hi1 = match("a", true);
    const hi2 = match("a", false);
    const lo1 = match("b", true);
    const eq = match("c", true);
    const noData = match("d", true);
    const before = new Map([
      [hi1.id, new Map([[ME, 1000], ["a", 1100]])],
      [hi2.id, new Map([[ME, 1000], ["a", 1200]])],
      [lo1.id, new Map([[ME, 1000], ["b", 900]])],
      [eq.id, new Map([[ME, 1000], ["c", 1000]])],
    ]);
    expect(ratingSplits([hi1, hi2, lo1, eq, noData], ME, before)).toEqual({
      higher: { wins: 1, losses: 1 },
      lower: { wins: 1, losses: 0 },
    });
  });
});

describe("rivals", () => {
  it("sorts by games, then by the newest game, and caps at n", () => {
    const ms = [
      match("b", true, "8ball", "2026-10-10"),
      match("a", true, "8ball", "2026-10-09"),
      match("a", false, "8ball", "2026-10-08"),
      match("b", true, "8ball", "2026-10-07"),
      match("c", true, "8ball", "2026-10-12"),
      match("d", true, "8ball", "2026-10-11", false),
    ];
    const out = rivals(ms, ME);
    expect(out.map((r) => r.opponentId)).toEqual(["b", "a", "c"]);
    expect(out[0]).toMatchObject({ games: 2, wins: 2, losses: 0, lastPlayedAt: "2026-10-10" });
    expect(rivals(ms, ME, 2)).toHaveLength(2);
  });

  it("dates Last played by the newest played_at, not the confirmation order (ruling S3-R6)", () => {
    // Newest first by confirmed_at: the Oct 5 game was confirmed late, after
    // the Oct 12 game, so it comes first, but Oct 12 is the last time they played.
    const ms = [match("a", true, "8ball", "2026-10-05"), match("a", false, "8ball", "2026-10-12")];
    expect(rivals(ms, ME)[0].lastPlayedAt).toBe("2026-10-12");
  });

  it("finds the opponent when they reported", () => {
    const out = rivals([match("a", false, "8ball", "2026-10-01", false)], ME);
    expect(out[0]).toMatchObject({ opponentId: "a", games: 1, wins: 0, losses: 1 });
  });

  it("counts a run only when it is two or more", () => {
    const run3 = rivals([match("a", true), match("a", true), match("a", true), match("a", false)], ME)[0];
    expect(run3.run).toEqual({ k: 3, ownerWon: true });
    const oppRun = rivals([match("a", false), match("a", false), match("a", true)], ME)[0];
    expect(oppRun.run).toEqual({ k: 2, ownerWon: false });
    const wlw = rivals([match("a", true), match("a", false), match("a", true)], ME)[0];
    expect(wlw.run).toBeNull();
    const single = rivals([match("a", true)], ME)[0];
    expect(single.run).toBeNull();
  });
});

describe("a batch confirmed out of play order (ruling S3-R7)", () => {
  // Played W, W, L against Sam (oldest to newest), then confirmed L first, so
  // newest confirmed first the list is W, W, L.
  const logged = (iWon: boolean, day: string) => ({
    ...match("sam", iWon, "8ball", day),
    created_at: `${day}T20:00:00Z`,
    reporter_score: iWon ? 5 : 3,
    opponent_score: iWon ? 3 : 5,
  });
  const w1 = logged(true, "2026-10-01");
  const w2 = logged(true, "2026-10-02");
  const l3 = logged(false, "2026-10-03");
  const newestConfirmedFirst = [w1, w2, l3];
  const played = [...newestConfirmedFirst].sort(byPlayOrder);

  it("has no won-the-last-2 run: the newest game was a loss", () => {
    expect(rivals(played, ME)[0].run).toBeNull();
    expect(rivalLine(rivals(played, ME)[0], "You", "Sam", "2026-10-21")).toBe("Last played Sat, Oct 3");
    // Confirmation order would have said "You've won the last 2".
    expect(rivals(newestConfirmedFirst, ME)[0].run).toEqual({ k: 2, ownerWon: true });
  });

  it("ends the form dots W, W, L, the newest on the right", () => {
    expect(formDots(played, ME, 10)).toEqual(["W", "W", "L"]);
    expect(formSummary(formDots(played, ME, 10))).toBe("won 2 of your last 3");
  });

  it("still counts the best streak as played", () => {
    expect(longestWinStreak(played, ME)).toBe(2);
  });
});

describe("rivalLine", () => {
  const today = "2026-10-21";
  it("reads You've won the last k on your own page", () => {
    expect(rivalLine({ run: { k: 3, ownerWon: true }, lastPlayedAt: today }, "You", "Sam", today)).toBe("You've won the last 3");
  });
  it("names the page owner on someone else's page", () => {
    expect(rivalLine({ run: { k: 2, ownerWon: true }, lastPlayedAt: today }, "Riley", "Sam", today)).toBe("Riley has won the last 2");
  });
  it("names the opponent when they hold the run", () => {
    expect(rivalLine({ run: { k: 4, ownerWon: false }, lastPlayedAt: today }, "You", "Sam", today)).toBe("Sam has won the last 4");
  });
  it("falls back to when you last played", () => {
    expect(rivalLine({ run: null, lastPlayedAt: "2026-10-13" }, "You", "Sam", today)).toBe("Last played Tue, Oct 13");
    expect(rivalLine({ run: null, lastPlayedAt: today }, "You", "Sam", today)).toBe("Last played today");
    expect(rivalLine({ run: null, lastPlayedAt: "2026-10-20" }, "You", "Sam", today)).toBe("Last played yesterday");
  });
});

describe("rankAsOf", () => {
  const AT = "2026-10-01T04:00:00.000Z";
  const hist = (profile_id: string, rating_after: number, created_at: string) => ({ profile_id, rating_after, created_at });
  const game = (winner: string, loser: string, confirmed_at: string | null) => ({
    reporter_id: winner,
    opponent_id: loser,
    winner_id: winner,
    confirmed_at,
  });

  it("ranks by each member's latest rating before the instant", () => {
    // a led after the first game; b's big win in the second flips it.
    const history = [
      hist("a", 470, "2026-09-10T00:00:00Z"),
      hist("b", 430, "2026-09-10T00:00:00Z"),
      hist("a", 440, "2026-09-20T00:00:00Z"),
      hist("b", 460, "2026-09-20T00:00:00Z"),
    ];
    const matches = [game("a", "b", "2026-09-10T00:00:00Z"), game("b", "a", "2026-09-20T00:00:00Z")];
    expect(rankAsOf(["a", "b"], history, matches, AT, "b")).toBe(1);
    expect(rankAsOf(["a", "b"], history, matches, AT, "a")).toBe(2);
  });

  it("ignores games and history at or after the instant", () => {
    const history = [
      hist("a", 466, "2026-09-10T00:00:00Z"),
      hist("b", 434, "2026-09-10T00:00:00Z"),
      // b's win lands exactly at the instant, then another later: neither counts.
      hist("b", 470, AT),
      hist("a", 430, AT),
      hist("b", 490, "2026-10-05T00:00:00Z"),
    ];
    const matches = [game("a", "b", "2026-09-10T00:00:00Z"), game("b", "a", AT), game("b", "a", "2026-10-05T00:00:00Z")];
    expect(rankAsOf(["a", "b"], history, matches, AT, "a")).toBe(1);
    expect(rankAsOf(["a", "b"], history, matches, AT, "b")).toBe(2);
  });

  it("puts a game at 11:30 PM on the 30th in the old month and 00:30 on the 1st in the new", () => {
    const monthStart = clubMonthStart(new Date("2026-10-21T15:00:00Z")).toISOString();
    // Sep 30, 11:30 PM EDT counts at the month start; Oct 1, 00:30 EDT does not.
    const matches = [game("a", "b", "2026-10-01T03:30:00Z"), game("c", "d", "2026-10-01T04:30:00Z")];
    const ids = ["a", "b", "c", "d"];
    expect(rankAsOf(ids, [], matches, monthStart, "a")).toBe(1);
    expect(rankAsOf(ids, [], matches, monthStart, "c")).toBeNull();
  });

  it("leaves members with no confirmed game before the instant unranked", () => {
    const history = [
      hist("a", 466, "2026-09-10T00:00:00Z"),
      hist("b", 434, "2026-09-10T00:00:00Z"),
      hist("c", 600, "2026-10-02T00:00:00Z"),
    ];
    // c: one unconfirmed game, one confirmed after the instant.
    const matches = [game("a", "b", "2026-09-10T00:00:00Z"), game("c", "a", null), game("c", "b", "2026-10-02T00:00:00Z")];
    expect(rankAsOf(["a", "b", "c"], history, matches, AT, "c")).toBeNull();
    // The unranked member doesn't push anyone down.
    expect(rankAsOf(["a", "b", "c"], history, matches, AT, "a")).toBe(1);
    expect(rankAsOf(["a", "b", "c"], history, matches, AT, "b")).toBe(2);
  });

  it("gives anyone without history before the instant the starting rating", () => {
    expect(STARTING_RATING).toBe(450);
    // b has games but no history row: 450 sits between a's 451 and c's 449.
    const history = [hist("a", 451, "2026-09-10T00:00:00Z"), hist("c", 449, "2026-09-11T00:00:00Z")];
    const matches = [game("a", "c", "2026-09-10T00:00:00Z"), game("b", "c", "2026-09-11T00:00:00Z")];
    expect(rankAsOf(["a", "b", "c"], history, matches, AT, "a")).toBe(1);
    expect(rankAsOf(["a", "b", "c"], history, matches, AT, "b")).toBe(2);
    expect(rankAsOf(["a", "b", "c"], history, matches, AT, "c")).toBe(3);
  });

  it("breaks rating ties by wins, then id", () => {
    // Everyone at 450: z has 2 wins; x and y one each, x first by id; w none.
    const matches = [
      game("z", "w", "2026-09-01T00:00:00Z"),
      game("z", "w", "2026-09-02T00:00:00Z"),
      game("y", "w", "2026-09-03T00:00:00Z"),
      game("x", "w", "2026-09-04T00:00:00Z"),
    ];
    const ids = ["w", "x", "y", "z"];
    expect(ids.map((id) => rankAsOf(ids, [], matches, AT, id))).toEqual([4, 2, 3, 1]);
  });

  it("is null for someone who isn't a member", () => {
    expect(rankAsOf(["a"], [], [game("a", "q", "2026-09-01T00:00:00Z")], AT, "q")).toBeNull();
  });
});

describe("monthSentence", () => {
  const base = { month: "October", rankStart: null, rankNow: null, last: null };

  it("counts games and wins, singular and plural", () => {
    expect(monthSentence({ ...base, games: 1, wins: 1 })).toBe("October so far: 1 game, 1 win.");
    expect(monthSentence({ ...base, games: 7, wins: 0 })).toBe("October so far: 7 games, 0 wins.");
    expect(monthSentence({ ...base, games: 3, wins: 2 })).toBe("October so far: 3 games, 2 wins.");
  });

  it("adds the climb when ranked at the month start and higher now", () => {
    expect(monthSentence({ ...base, games: 7, wins: 5, rankStart: 6, rankNow: 3 })).toBe(
      "October so far: 7 games, 5 wins. You climbed from #6 to #3."
    );
  });

  it("says you're on the board when you were unranked at the month start", () => {
    expect(monthSentence({ ...base, games: 1, wins: 0, rankStart: null, rankNow: 9 })).toBe(
      "October so far: 1 game, 0 wins. You're on the board at #9."
    );
  });

  it("adds no clause when the rank fell, held or can't be computed", () => {
    expect(monthSentence({ ...base, games: 4, wins: 1, rankStart: 3, rankNow: 5 })).toBe("October so far: 4 games, 1 win.");
    expect(monthSentence({ ...base, games: 4, wins: 2, rankStart: 3, rankNow: 3 })).toBe("October so far: 4 games, 2 wins.");
    expect(monthSentence({ ...base, games: 2, wins: 1, rankStart: 3, rankNow: null })).toBe("October so far: 2 games, 1 win.");
    expect(monthSentence({ ...base, games: 2, wins: 1, rankStart: null, rankNow: null })).toBe("October so far: 2 games, 1 win.");
  });

  it("says when your last game was when there are none this month", () => {
    expect(
      monthSentence({
        ...base,
        games: 0,
        wins: 0,
        rankStart: 4,
        rankNow: 4,
        last: { playedAt: "2026-09-28", opponent: "Jordan Avery" },
      })
    ).toBe("No games yet in October. Your last was Sep 28 vs Jordan.");
  });

  it("is null with no games ever", () => {
    expect(monthSentence({ ...base, games: 0, wins: 0 })).toBeNull();
  });
});

describe("chartSeries", () => {
  let n = 0;
  const row = (rating_before: number, rating_after: number, created_at: string) => {
    n += 1;
    return { match_id: `h${n}`, rating_before, rating_after, created_at };
  };
  const rows = [
    row(450, 466, "2026-09-10T00:00:00Z"),
    row(466, 480, "2026-09-20T00:00:00Z"),
    row(480, 470, "2026-10-03T00:00:00Z"),
    row(470, 492, "2026-10-09T00:00:00Z"),
    row(492, 485, "2026-10-15T00:00:00Z"),
  ];
  const OCT = "2026-10-01T04:00:00.000Z";

  it("starts the all range at the first rating_before and ends at the last rating_after", () => {
    const s = chartSeries(rows, "all", null);
    expect(s.points.map((p) => p.rating)).toEqual([450, 466, 480, 470, 492, 485]);
    expect(s.points[0]).toEqual({ at: "2026-09-10T00:00:00Z", rating: 450, matchId: null });
    expect(s.points[1].matchId).toBe(rows[0].match_id);
    expect(s.change).toBe(35);
  });

  it("starts a bounded range at the rating before its first game", () => {
    const s = chartSeries(rows, "month", OCT);
    expect(s.points.map((p) => p.rating)).toEqual([480, 470, 492, 485]);
    expect(s.change).toBe(5);
    expect(chartSeries(rows, "season", "2026-09-15T00:00:00Z").points.map((p) => p.rating)).toEqual([
      466, 480, 470, 492, 485,
    ]);
  });

  it("puts the peak at the max, the first time it was reached", () => {
    expect(chartSeries(rows, "all", null).peak).toEqual({ index: 4, rating: 492 });
    const tied = [
      row(450, 470, "2026-09-01T00:00:00Z"),
      row(470, 460, "2026-09-02T00:00:00Z"),
      row(460, 470, "2026-09-03T00:00:00Z"),
    ];
    expect(chartSeries(tied, "all", null).peak).toEqual({ index: 1, rating: 470 });
  });

  it("marks a peak only when it is reached inside the range (ruling S3-R4)", () => {
    // October only lost: the high was the rating going in, never "peak".
    const falling = [row(500, 490, "2026-10-03T00:00:00Z"), row(490, 484, "2026-10-09T00:00:00Z")];
    expect(chartSeries(falling, "month", OCT).peak).toBeNull();
    expect(chartSeries(falling, "month", OCT).change).toBe(-16);
    // Back to the opening rating but never above it: still no peak.
    const level = [row(470, 460, "2026-10-03T00:00:00Z"), row(460, 470, "2026-10-09T00:00:00Z")];
    expect(chartSeries(level, "month", OCT).peak).toBeNull();
    // One win is a peak at its own point.
    expect(chartSeries([row(450, 466, "2026-10-02T00:00:00Z")], "month", OCT).peak).toEqual({ index: 1, rating: 466 });
  });

  it("has no change or peak with fewer than 2 points in range", () => {
    expect(chartSeries(rows, "month", "2026-11-01T04:00:00.000Z")).toEqual({ points: [], change: null, peak: null });
    expect(chartSeries([], "all", null)).toEqual({ points: [], change: null, peak: null });
  });

  it("draws one game as two points", () => {
    const s = chartSeries([row(450, 466, "2026-10-02T00:00:00Z")], "month", OCT);
    expect(s.points.map((p) => p.rating)).toEqual([450, 466]);
    expect(s.change).toBe(16);
  });
});

describe("chart copy", () => {
  it("signs the change with a real minus and names the range", () => {
    expect(chartChangeLabel(12, "month")).toBe("+12 this month");
    expect(chartChangeLabel(-8, "season")).toBe("−8 this season");
    expect(chartChangeLabel(42, "all")).toBe("+42 since your first game");
  });

  it("says their first game on someone else's page", () => {
    expect(chartChangeLabel(-44, "all", "their")).toBe("−44 since their first game");
    expect(chartChangeLabel(12, "month", "their")).toBe("+12 this month");
  });

  it("says when a range has no rated games", () => {
    expect(chartEmptyLabel("month")).toBe("No rated games this month");
    expect(chartEmptyLabel("season")).toBe("No rated games this season");
  });

  it("reads the line's ends for screen readers", () => {
    const s = chartSeries(
      [
        { match_id: "x", rating_before: 470, rating_after: 490, created_at: "2026-10-02T00:00:00Z" },
        { match_id: "y", rating_before: 490, rating_after: 512, created_at: "2026-10-04T00:00:00Z" },
      ],
      "season",
      null
    );
    expect(chartAriaLabel(s, "season")).toBe("Rating chart, season: 470 to 512");
  });
});

describe("bestWinMarker", () => {
  const points = [
    { at: "t0", rating: 450, matchId: null },
    { at: "t1", rating: 466, matchId: "m1" },
    { at: "t2", rating: 480, matchId: "m2" },
  ];
  it("sits on the point the win produced, labelled with the first name", () => {
    expect(bestWinMarker(points, { matchId: "m2", opponent: "Alex Morgan" })).toEqual({ index: 2, label: "beat Alex" });
  });
  it("is null when there is no best win or it is outside the range", () => {
    expect(bestWinMarker(points, null)).toBeNull();
    expect(bestWinMarker(points, { matchId: "m9", opponent: "Alex" })).toBeNull();
  });
});
