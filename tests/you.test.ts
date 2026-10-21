import { describe, expect, it } from "vitest";
import { formSummary, gameSplits, ratingSplits, rivalLine, rivals, type YouMatch } from "@/lib/you";

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
