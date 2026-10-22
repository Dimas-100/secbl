import { describe, expect, it } from "vitest";
import { PASS_TOP, badgeMoment, isStreakMark, passMoment, streakMoment } from "@/lib/activity";
import { levelFromXp, xpToReach } from "@/lib/levels";
import type { StatMatch } from "@/lib/stats";

const m = (winner: string, loser: string, i: number): StatMatch => ({
  id: `m${i}`,
  reporter_id: winner,
  opponent_id: loser,
  winner_id: winner,
  reporter_score: 5,
  opponent_score: 3,
  confirmed_at: `2026-09-${String(i).padStart(2, "0")}T00:00:00Z`,
});

describe("badgeMoment", () => {
  it("fires only when the title goes up", () => {
    const rookie = levelFromXp(0);
    const stillRookie = levelFromXp(200);
    expect(badgeMoment(rookie, stillRookie)).toBeNull();
    const regular = levelFromXp(xpToReach(5)); // level 5 = Regular
    expect(badgeMoment(stillRookie, regular)).toEqual({ title: "Regular", level: 5 });
    expect(badgeMoment(regular, regular)).toBeNull();
    expect(badgeMoment(regular, rookie)).toBeNull();
  });
});

describe("streakMoment", () => {
  it("marks 3, 5, 10 and every 5 after", () => {
    expect([1, 2, 3, 4, 5, 6, 9, 10, 15, 20, 21].map(isStreakMark)).toEqual([
      false, false, true, false, true, false, false, true, true, true, false,
    ]);
  });
  it("reads the current win streak for the winner, newest first", () => {
    const three = [m("a", "b", 3), m("a", "c", 2), m("a", "d", 1)];
    expect(streakMoment(three, "a")).toEqual({ length: 3 });
    expect(streakMoment([m("a", "b", 4), ...three], "a")).toBeNull(); // 4 is not a mark
    expect(streakMoment([m("b", "a", 4), ...three], "a")).toBeNull(); // just lost
    expect(streakMoment([], "a")).toBeNull();
  });
  it("only credits the game just confirmed when it is part of the run", () => {
    // Play order, newest first: three wins after a loss. A win from before
    // that loss, confirmed late, did not make the run (ruling S3-R7).
    const run = [m("a", "b", 6), m("a", "c", 5), m("a", "d", 4), m("e", "a", 3)];
    expect(streakMoment(run, "a", "m5")).toEqual({ length: 3 });
    expect(streakMoment([...run, m("a", "f", 2)], "a", "m2")).toBeNull();
    expect(streakMoment(run, "a", "m6")).toEqual({ length: 3 });
  });
});

describe("passMoment", () => {
  const board = (ratings: Record<string, number>) =>
    Object.entries(ratings).map(([id, rating]) => ({ id, rating, wins: 1, losses: 0 }));
  it("names the highest player jumped and the new rank", () => {
    const before = board({ a: 600, b: 550, c: 540, d: 500 });
    const after = board({ a: 600, b: 550, c: 540, d: 560 });
    expect(passMoment(before, after, "d")).toEqual({ rank: 2, otherId: "b" });
  });
  it("is null when already on top, when nobody was jumped, or outside the top 10", () => {
    expect(passMoment(board({ a: 600, b: 500 }), board({ a: 620, b: 500 }), "a")).toBeNull();
    expect(passMoment(board({ a: 600, b: 500 }), board({ a: 600, b: 520 }), "b")).toBeNull();
    const big: Record<string, number> = {};
    for (let i = 0; i < PASS_TOP + 2; i++) big[`p${i}`] = 1000 - i * 10;
    const last = `p${PASS_TOP + 1}`;
    const after = { ...big, [last]: big[`p${PASS_TOP}`] + 1 }; // climbs to #11
    expect(passMoment(board(big), board(after), last)).toBeNull();
    expect(passMoment(board({ a: 600 }), board({ a: 600 }), "zz")).toBeNull();
  });
  it("is null when the winner only jumps members who have not played", () => {
    const row = (id: string, rating: number, wins: number, losses = 0) => ({ id, rating, wins, losses });
    const before = [row("a", 600, 3), row("w", 440, 0, 1), row("u", 450, 0, 0)];
    const after = [row("a", 600, 3), row("w", 470, 1, 1), row("u", 450, 0, 0)];
    expect(passMoment(before, after, "w")).toBeNull();
  });
  it("orders members at the same rating by wins", () => {
    const row = (id: string, rating: number, wins: number, losses = 0) => ({ id, rating, wins, losses });
    // Before: a (5 wins) and w (1 win) share 500, so a is #1 and w #2. w wins and
    // ends on 520, the new #1.
    const before = [row("a", 500, 5), row("w", 500, 0, 1)];
    const after = [row("a", 500, 5), row("w", 520, 1, 1)];
    expect(passMoment(before, after, "w")).toEqual({ rank: 1, otherId: "a" });
    // Same rating after the match: wins decide, so w (2 wins) stays below a (5 wins).
    const tied = [row("a", 500, 5), row("w", 500, 2, 1)];
    expect(passMoment(before, tied, "w")).toBeNull();
  });
});
