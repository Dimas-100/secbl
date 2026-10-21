import { describe, expect, it } from "vitest";
import {
  aboveOf,
  boardAtMatch,
  boardBefore,
  compareRank,
  isPlaced,
  leadOf,
  rankOf,
  rankedIds,
  toRankRow,
  type RankRow,
} from "@/lib/ranking";

const row = (id: string, rating: number, wins: number, losses = 0): RankRow => ({ id, rating, wins, losses });

const rows: RankRow[] = [row("a", 500, 2), row("b", 500, 3), row("c", 520, 0, 1), row("d", 450, 0, 0)];

describe("toRankRow", () => {
  it("turns PostgREST string counts into numbers", () => {
    expect(toRankRow({ id: "a", rating: 512, wins: "3", losses: "1" })).toEqual({
      id: "a",
      rating: 512,
      wins: 3,
      losses: 1,
    });
    expect(toRankRow({ id: "b", rating: "450", wins: 0, losses: 0 })).toEqual({
      id: "b",
      rating: 450,
      wins: 0,
      losses: 0,
    });
  });
});

describe("isPlaced", () => {
  it("is true once a member has a confirmed game", () => {
    expect(isPlaced(row("x", 450, 0, 0))).toBe(false);
    expect(isPlaced(row("x", 450, 1, 0))).toBe(true);
    expect(isPlaced(row("x", 450, 0, 1))).toBe(true);
  });
});

describe("compareRank / rankedIds", () => {
  it("orders by rating, then wins, and leaves out members who have not played", () => {
    expect(rankedIds(rows)).toEqual(["c", "b", "a"]);
  });
  it("breaks a full tie by id", () => {
    expect(rankedIds([row("m", 500, 2), row("k", 500, 2), row("z", 500, 2)])).toEqual(["k", "m", "z"]);
    expect(compareRank(row("k", 500, 2), row("m", 500, 2))).toBeLessThan(0);
  });
  it("does not depend on the input order", () => {
    expect(rankedIds([...rows].reverse())).toEqual(["c", "b", "a"]);
  });
});

describe("rankOf", () => {
  it("is the 1-based place among members who have played", () => {
    expect(rankOf(rows, "c")).toBe(1);
    expect(rankOf(rows, "b")).toBe(2);
    expect(rankOf(rows, "a")).toBe(3);
  });
  it("is null for an unplaced or unknown member", () => {
    expect(rankOf(rows, "d")).toBeNull();
    expect(rankOf(rows, "zz")).toBeNull();
    expect(rankOf([], "a")).toBeNull();
  });
});

describe("aboveOf", () => {
  it("names the placed member directly above and the rating gap", () => {
    expect(aboveOf(rows, "a")).toEqual({ id: "b", rank: 2, gap: 0 });
    expect(aboveOf(rows, "b")).toEqual({ id: "c", rank: 1, gap: 20 });
  });
  it("is null for #1 and for an unplaced member", () => {
    expect(aboveOf(rows, "c")).toBeNull();
    expect(aboveOf(rows, "d")).toBeNull();
  });
});

describe("leadOf", () => {
  it("is the margin over #2, only for #1", () => {
    expect(leadOf(rows, "c")).toEqual({ id: "b", gap: 20 });
    expect(leadOf(rows, "b")).toBeNull();
  });
  it("is null with a single placed member or an unplaced one", () => {
    expect(leadOf([row("a", 500, 1), row("d", 450, 0)], "a")).toBeNull();
    expect(leadOf(rows, "d")).toBeNull();
  });
});

describe("boardBefore", () => {
  // The board after w beat l: the view already counts that game.
  const after: RankRow[] = [row("w", 470, 4, 2), row("l", 480, 3, 3), row("x", 475, 2, 2), row("n", 450, 0, 0)];
  const before = new Map([
    ["w", 455],
    ["l", 495],
  ]);

  it("takes the game back out: both players' pre-game ratings, one win and one loss fewer", () => {
    expect(boardBefore(after, "w", "l", before)).toEqual([
      row("w", 455, 3, 2),
      row("l", 495, 3, 2),
      row("x", 475, 2, 2),
      row("n", 450, 0, 0),
    ]);
  });

  it("leaves the winner unplaced before their first game", () => {
    const first = [row("w", 466, 1, 0), row("l", 480, 3, 3)];
    const was = boardBefore(first, "w", "l", new Map([["w", 450], ["l", 496]]));
    expect(was[0]).toEqual(row("w", 450, 0, 0));
    expect(isPlaced(was[0])).toBe(false);
    expect(rankedIds(was)).toEqual(["l"]);
  });

  it("leaves the loser unplaced before their first game", () => {
    const first = [row("w", 510, 5, 1), row("l", 434, 0, 1)];
    const was = boardBefore(first, "w", "l", new Map([["w", 494], ["l", 450]]));
    expect(was[1]).toEqual(row("l", 450, 0, 0));
    expect(isPlaced(was[1])).toBe(false);
    expect(rankedIds(was)).toEqual(["w"]);
  });

  it("leaves a player's row unchanged when their rating_history row is missing", () => {
    const was = boardBefore(after, "w", "l", new Map([["w", 455]]));
    expect(was[0]).toEqual(row("w", 455, 3, 2));
    expect(was[1]).toEqual(after[1]);
  });

  it("does not change the board it was given", () => {
    const copy = after.map((r) => ({ ...r }));
    boardBefore(after, "w", "l", before);
    expect(after).toEqual(copy);
  });
});

describe("boardAtMatch", () => {
  it("puts the two players at this game's rating_after and leaves everyone else as today", () => {
    const today: RankRow[] = [row("me", 515, 3, 1), row("t", 540, 6, 2), row("x", 505, 2, 2)];
    expect(boardAtMatch(today, new Map([["me", 510], ["t", 485]]))).toEqual([
      row("me", 510, 3, 1),
      row("t", 485, 6, 2),
      row("x", 505, 2, 2),
    ]);
  });
  it("leaves a player with no rating_history row for the game as is", () => {
    const today: RankRow[] = [row("me", 515, 3, 1), row("t", 540, 6, 2)];
    expect(boardAtMatch(today, new Map([["me", 510]]))).toEqual([row("me", 510, 3, 1), row("t", 540, 6, 2)]);
  });
});
