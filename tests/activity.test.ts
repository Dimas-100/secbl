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
});

describe("passMoment", () => {
  const board = (ratings: Record<string, number>) => Object.entries(ratings).map(([id, rating]) => ({ id, rating }));
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
});
