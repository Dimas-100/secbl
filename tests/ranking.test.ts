import { describe, expect, it } from "vitest";
import { aboveOf, compareRank, isPlaced, leadOf, rankOf, rankedIds, toRankRow, type RankRow } from "@/lib/ranking";

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
