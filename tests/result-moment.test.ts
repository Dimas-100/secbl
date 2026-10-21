import { describe, expect, it } from "vitest";
import type { RankRow } from "@/lib/ranking";
import { momentLines, rankMove, rematchHref, resultHeadline, secondAction } from "@/lib/result-moment";

const row = (id: string, rating: number, wins = 1, losses = 0): RankRow => ({ id, rating, wins, losses });
const none = {
  move: null,
  levelBefore: 2,
  levelAfter: 2,
  titleUnlocked: null,
  achievementsUnlocked: [],
  firstWinOver: null,
  winStreak: null,
  gameRecord: null,
};

describe("resultHeadline", () => {
  it("names the opponent and puts my score first on a win", () => {
    expect(resultHeadline(true, "Ana", 3, 1)).toBe("You beat Ana 3–1");
  });
  it("puts their score first on a loss", () => {
    expect(resultHeadline(false, "Ana", 1, 3)).toBe("Ana beat you 3–1");
  });
});

describe("rankMove", () => {
  it("up past one member", () => {
    const before = [row("a", 600), row("b", 550), row("me", 500)];
    const after = [row("a", 600), row("me", 560, 2), row("b", 550)];
    expect(rankMove(before, after, "me")).toEqual({ kind: "up", to: 2, otherId: "b" });
  });
  it("up past two members names the highest-placed one", () => {
    const before = [row("a", 600), row("b", 550), row("c", 520), row("me", 500)];
    const after = [row("a", 600), row("me", 570, 2), row("b", 550), row("c", 520)];
    expect(rankMove(before, after, "me")).toEqual({ kind: "up", to: 2, otherId: "b" });
  });
  it("up past someone who was unranked before never names them", () => {
    const before = [row("a", 600), row("me", 500), row("u", 450, 0, 0)];
    const after = [row("me", 620, 2), row("a", 600)];
    expect(rankMove(before, after, "me")).toEqual({ kind: "up", to: 1, otherId: "a" });
  });
  it("down names the member now directly above who was below me", () => {
    const before = [row("a", 600), row("me", 560), row("b", 550)];
    const after = [row("a", 600), row("b", 550), row("me", 540, 1, 1)];
    expect(rankMove(before, after, "me")).toEqual({ kind: "down", to: 3, otherId: "b" });
  });
  it("entered when I was unranked before and ranked after", () => {
    const before = [row("a", 600), row("me", 450, 0, 0)];
    const after = [row("a", 600), row("me", 470)];
    expect(rankMove(before, after, "me")).toEqual({ kind: "entered", to: 2, otherId: null });
  });
  it("unchanged is null", () => {
    const before = [row("a", 600), row("me", 500)];
    const after = [row("a", 590), row("me", 510, 2)];
    expect(rankMove(before, after, "me")).toBeNull();
  });
  it("unranked after is null", () => {
    const before = [row("a", 600), row("me", 450, 0, 0)];
    const after = [row("a", 600), row("me", 450, 0, 0)];
    expect(rankMove(before, after, "me")).toBeNull();
  });
});

describe("momentLines", () => {
  it("rank lines", () => {
    expect(momentLines({ ...none, move: { kind: "up", to: 2, other: "Ana" } })).toEqual(["Up to #2, passing Ana"]);
    expect(momentLines({ ...none, move: { kind: "down", to: 4, other: "Ana" } })).toEqual(["Down to #4, Ana passed you"]);
    expect(momentLines({ ...none, move: { kind: "entered", to: 5, other: null } })).toEqual(["On the board at #5"]);
  });
  it("a rank line without a name stays true and drops the name", () => {
    expect(momentLines({ ...none, move: { kind: "up", to: 2, other: null } })).toEqual(["Up to #2"]);
    expect(momentLines({ ...none, move: { kind: "down", to: 4, other: null } })).toEqual(["Down to #4"]);
  });
  it("level line only when a level was crossed and no title came with it", () => {
    expect(momentLines({ ...none, levelAfter: 3 })).toEqual(["Level 3"]);
    expect(momentLines({ ...none, levelAfter: 3, titleUnlocked: "Shark" })).toEqual(["Shark badge unlocked"]);
    expect(momentLines(none)).toEqual([]);
  });
  it("title, achievement, first win, streak and record lines", () => {
    expect(momentLines({ ...none, titleUnlocked: "Shark" })).toEqual(["Shark badge unlocked"]);
    expect(momentLines({ ...none, achievementsUnlocked: ["Sharpshooter"] })).toEqual(["Sharpshooter unlocked"]);
    expect(momentLines({ ...none, firstWinOver: "Ana" })).toEqual(["Your first win over Ana"]);
    expect(momentLines({ ...none, winStreak: 3 })).toEqual(["3 wins in a row"]);
    expect(momentLines({ ...none, gameRecord: { label: "8-ball", wins: 7, losses: 2 } })).toEqual([
      "8-ball record now 7–2",
    ]);
  });
  it("a win streak shows at 3, 5 and 10 or more only", () => {
    for (const k of [3, 5, 10, 12]) expect(momentLines({ ...none, winStreak: k })).toEqual([`${k} wins in a row`]);
    for (const k of [0, 1, 2, 4, 6, 9]) expect(momentLines({ ...none, winStreak: k })).toEqual([]);
    expect(momentLines({ ...none, winStreak: null })).toEqual([]);
  });
  it("caps at three in priority order", () => {
    const all = {
      move: { kind: "up" as const, to: 1, other: "Ana" },
      levelBefore: 2,
      levelAfter: 3,
      titleUnlocked: "Shark",
      achievementsUnlocked: ["Sharpshooter"],
      firstWinOver: "Ana",
      winStreak: 5,
      gameRecord: { label: "8-ball", wins: 7, losses: 2 },
    };
    expect(momentLines(all)).toEqual(["Up to #1, passing Ana", "Shark badge unlocked", "Sharpshooter unlocked"]);
    expect(momentLines({ ...all, titleUnlocked: null })).toEqual([
      "Up to #1, passing Ana",
      "Level 3",
      "Sharpshooter unlocked",
    ]);
    expect(momentLines({ ...all, move: null, titleUnlocked: null, achievementsUnlocked: [] })).toEqual([
      "Level 3",
      "Your first win over Ana",
      "5 wins in a row",
    ]);
  });
  it("several achievements fill the remaining slots in order", () => {
    expect(momentLines({ ...none, achievementsUnlocked: ["A one", "B two", "C three", "D four"] })).toEqual([
      "A one unlocked",
      "B two unlocked",
      "C three unlocked",
    ]);
  });
});

describe("secondAction", () => {
  const base = {
    nightOpen: true,
    nightOpenedAt: "2026-10-21T18:00:00Z",
    myNightKind: "out",
    confirmedAt: "2026-10-21T19:00:00Z",
  };
  it("back in line when the night is open, I am out, and the game came after it opened", () => {
    expect(secondAction(base)).toBe("back_in_line");
  });
  it("rematch when no night is open", () => {
    expect(secondAction({ ...base, nightOpen: false })).toBe("rematch");
    expect(secondAction({ ...base, nightOpenedAt: null })).toBe("rematch");
  });
  it("rematch when I am not out", () => {
    for (const k of ["in_line", "playing", "none"]) expect(secondAction({ ...base, myNightKind: k })).toBe("rematch");
  });
  it("rematch when the game was confirmed before the night opened", () => {
    expect(secondAction({ ...base, confirmedAt: "2026-10-21T17:59:59Z" })).toBe("rematch");
  });
});

describe("rematchHref", () => {
  it("carries the opponent, game, race and the rematch flag", () => {
    expect(rematchHref({ opponentId: "abc", gameType: "eight_ball", raceTo: 3 })).toBe(
      "/matches/new?opponent=abc&game=eight_ball&race=3&rematch=1"
    );
  });
  it("an open race passes race=open", () => {
    expect(rematchHref({ opponentId: "abc", gameType: "nine_ball", raceTo: null })).toBe(
      "/matches/new?opponent=abc&game=nine_ball&race=open&rematch=1"
    );
  });
});
