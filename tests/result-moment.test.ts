import { describe, expect, it } from "vitest";
import { boardBefore, ladderAt, type RankRow } from "@/lib/ranking";
import {
  firstWinOver,
  gameRankMove,
  momentLines,
  rankMove,
  rematchHref,
  resultHeadline,
  secondAction,
  signedChange,
  xpRow,
} from "@/lib/result-moment";

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
  it("down names the opponent when they passed me, not a bystander I dropped under (ruling S4-R7)", () => {
    // I lose to O: me 560 -> 535, O 540 -> 565. B never moved.
    const before = [row("a", 600), row("me", 560), row("b", 550), row("o", 540)];
    const after = [row("a", 600), row("o", 565, 2), row("b", 550), row("me", 535, 1, 1)];
    expect(rankMove(before, after, "me", "o")).toEqual({ kind: "down", to: 4, otherId: "o" });
    // An opponent who stayed below me is not named; the member above is.
    const stayed = [row("a", 600), row("b", 550), row("me", 545, 1, 1), row("o", 541, 2)];
    expect(rankMove(before, stayed, "me", "o")).toEqual({ kind: "down", to: 3, otherId: "b" });
  });
  it("down names nobody when whoever passed me was unranked before", () => {
    // O's first game: unplaced before, so never named; nobody else passed me.
    const before = [row("a", 600), row("me", 455), row("o", 450, 0, 0)];
    const after = [row("a", 600), row("o", 465), row("me", 440, 1, 1)];
    expect(rankMove(before, after, "me", "o")).toEqual({ kind: "down", to: 3, otherId: null });
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
  it("carries the opponent, game, race, the rematch flag and the game it rematches", () => {
    expect(rematchHref({ opponentId: "abc", gameType: "eight_ball", raceTo: 3, matchId: "m1" })).toBe(
      "/matches/new?opponent=abc&game=eight_ball&race=3&rematch=1&after=m1"
    );
  });
  it("an open race passes race=open", () => {
    expect(rematchHref({ opponentId: "abc", gameType: "nine_ball", raceTo: null, matchId: "m1" })).toBe(
      "/matches/new?opponent=abc&game=nine_ball&race=open&rematch=1&after=m1"
    );
  });
});

describe("firstWinOver", () => {
  // Newest first in play order (byPlayOrder), as Home passes them.
  const g = (id: string, opponent: string, winner: "me" | "them") => ({
    id,
    reporter_id: "me",
    opponent_id: opponent,
    winner_id: winner === "me" ? "me" : opponent,
    reporter_score: winner === "me" ? 3 : 1,
    opponent_score: winner === "me" ? 1 : 3,
    confirmed_at: "2026-10-21T20:00:00Z",
  });
  it("true for a win with no earlier win over that opponent", () => {
    expect(firstWinOver([g("now", "b", "me"), g("old", "b", "them"), g("other", "c", "me")], "me", "now")).toBe(true);
  });
  it("false when an earlier game in play order was already a win over them", () => {
    expect(firstWinOver([g("now", "b", "me"), g("old", "b", "me")], "me", "now")).toBe(false);
  });
  it("a win over them played later does not count as earlier", () => {
    expect(firstWinOver([g("later", "b", "me"), g("now", "b", "me")], "me", "now")).toBe(true);
  });
  it("false for a loss, and for a game not in the list", () => {
    expect(firstWinOver([g("now", "b", "them")], "me", "now")).toBe(false);
    expect(firstWinOver([g("now", "b", "me")], "me", "missing")).toBe(false);
  });
  it("reads my side when I was the opponent on the report", () => {
    const asOpponent = { ...g("now", "b", "me"), reporter_id: "b", opponent_id: "me" };
    const earlier = { ...g("old", "b", "me"), reporter_id: "b", opponent_id: "me" };
    expect(firstWinOver([asOpponent], "me", "now")).toBe(true);
    expect(firstWinOver([asOpponent, earlier], "me", "now")).toBe(false);
  });
});

describe("xpRow", () => {
  it("says what the game earned and fills the bar from where it was", () => {
    expect(xpRow({ xpEarned: 80, xpCapped: false, intoLevel: 210 })).toEqual({ label: "+80 XP", barFrom: 130 });
  });
  it("a game that crossed a level fills the new level from empty", () => {
    expect(xpRow({ xpEarned: 200, xpCapped: false, intoLevel: 60 })).toEqual({ label: "+200 XP", barFrom: 0 });
  });
  it("the weekly cap says so and never fakes a fill", () => {
    expect(xpRow({ xpEarned: 0, xpCapped: true, intoLevel: 210 })).toEqual({
      label: "No XP · weekly limit",
      barFrom: 210,
    });
  });
});

describe("signedChange", () => {
  it("a gain reads +n and a drop reads with a true minus sign", () => {
    expect(signedChange(14)).toBe("+14");
    expect(signedChange(-9)).toBe("−9");
    expect(signedChange(0)).toBe("+0");
  });
});

// The rank line is told on the ladder as it stood the instant this game
// counted (rulings S4-R3, S4-R5): everyone's rating and record as they were
// then, from today's ladder and the rating rows and games that came after.
describe("the rank line reads this game only (rulings S4-R3, S4-R5)", () => {
  const h = (profile_id: string, rating_before: number, created_at = "2026-10-21T21:00:00Z") => ({
    profile_id,
    rating_before,
    created_at,
  });
  const g = (reporter_id: string, opponent_id: string, winner_id: string) => ({ reporter_id, opponent_id, winner_id });

  it("a win over Taylor is not told as Taylor passing me when Taylor won on since", () => {
    // Before: me 500 (#1), Taylor 495 (#2). I win: 510 / 485, nothing moved.
    // Taylor then won twice and is 540 today.
    const today = [row("me", 510, 2, 1), row("t", 540, 5, 2), row("x", 470, 1, 3)];
    const goingIn = new Map([["me", 500], ["t", 495]]);
    // Today's board says Taylor passed me.
    expect(rankMove(boardBefore(today, "me", "t", goingIn), today, "me", "t")).toEqual({
      kind: "down",
      to: 2,
      otherId: "t",
    });
    const move = gameRankMove({
      today,
      laterHistory: [h("t", 485), h("t", 512, "2026-10-21T22:00:00Z"), h("x", 480), h("x", 475, "2026-10-21T22:00:00Z")],
      laterMatches: [g("t", "x", "t"), g("x", "t", "t")],
      winnerId: "me",
      loserId: "t",
      ratingBefore: goingIn,
      meId: "me",
      opponentId: "t",
    });
    expect(move).toBeNull();
  });

  it("a new opponent placed only by games after this one is never passed (review case a)", () => {
    // At game time: A 600, B 550, me 440 (#3); N's first game, unplaced at
    // 450. I beat N: 460 / 430. N then won five and is 520 today.
    const today = [row("a", 600, 3, 0), row("b", 550, 2, 1), row("n", 520, 5, 1), row("me", 460, 1, 2)];
    const goingIn = new Map([["me", 440], ["n", 450]]);
    const laterHistory = [h("n", 430), h("n", 445, "2026-10-21T21:30:00Z")];
    const laterMatches = ["z1", "z2", "z3", "z4", "z5"].map((z) => g("n", z, "n"));
    const at = { today, laterHistory, winnerId: "me", loserId: "n", ratingBefore: goingIn, meId: "me", opponentId: "n" };
    // Ratings alone (S4-R3) still count N as placed going in: "Up to #3, passing N".
    expect(gameRankMove({ ...at, laterMatches: [] })).toEqual({ kind: "up", to: 3, otherId: "n" });
    // As it stood: N unplaced before, me #3 before and after.
    expect(gameRankMove({ ...at, laterMatches })).toBeNull();
  });

  it("a third party's later loss is not told as my pass (review case b)", () => {
    // At game time: C 520 (#1), me 500 (#2), O 460. I beat O: 510 / 450.
    // C then lost to D: C 520 -> 505, D 480 -> 495. Today I am above C.
    const today = [row("me", 510, 3, 1), row("c", 505, 4, 2), row("d", 495, 2, 1), row("o", 450, 1, 3)];
    const goingIn = new Map([["me", 500], ["o", 460]]);
    const at = { today, winnerId: "me", loserId: "o", ratingBefore: goingIn, meId: "me", opponentId: "o" };
    // Today's third parties: "Up to #1, passing C".
    expect(gameRankMove({ ...at, laterHistory: [], laterMatches: [] })).toEqual({ kind: "up", to: 1, otherId: "c" });
    // As it stood: C still 520, above my 510, so nothing moved.
    expect(gameRankMove({ ...at, laterHistory: [h("c", 520), h("d", 480)], laterMatches: [g("d", "c", "d")] })).toBeNull();
  });

  it("a real pass in this game still reads as one, whatever happened since", () => {
    // Before: T 505 (#1), me 500 (#2). I win: 512 / 493. T then won on to 520.
    const today = [row("t", 520, 4, 1), row("me", 512, 3, 1), row("x", 470, 1, 2)];
    const move = gameRankMove({
      today,
      laterHistory: [h("t", 493), h("x", 497)],
      laterMatches: [g("t", "x", "t")],
      winnerId: "me",
      loserId: "t",
      ratingBefore: new Map([["me", 500], ["t", 505]]),
      meId: "me",
      opponentId: "t",
    });
    expect(move).toEqual({ kind: "up", to: 1, otherId: "t" });
  });

  it("a loss names the opponent who passed me, on the ladder as it stood", () => {
    // Before: me 520 (#1), B 515 (#2), O 505 (#3). I lose to O: 500 / 525.
    // B then lost a game and is 490 today; at the game B was 515, 2-1.
    const today = [row("o", 525, 3, 1), row("b", 490, 2, 2), row("me", 500, 2, 2)];
    const laterHistory = [h("b", 515)];
    const laterMatches = [g("b", "z", "z")];
    expect(ladderAt(today, laterHistory, laterMatches).find((r) => r.id === "b")).toEqual(row("b", 515, 2, 1));
    const move = gameRankMove({
      today,
      laterHistory,
      laterMatches,
      winnerId: "o",
      loserId: "me",
      ratingBefore: new Map([["me", 520], ["o", 505]]),
      meId: "me",
      opponentId: "o",
    });
    // B is directly above me now, but O is who passed me.
    expect(move).toEqual({ kind: "down", to: 3, otherId: "o" });
  });
});

describe("momentLines, a title and an achievement with the same name (ruling S4-R2)", () => {
  it("drops the achievement line whose label is the unlocked title", () => {
    expect(
      momentLines({ ...none, levelAfter: 5, titleUnlocked: "Regular", achievementsUnlocked: ["Regular", "Shutout"] })
    ).toEqual(["Regular badge unlocked", "Shutout unlocked"]);
  });
  it("keeps it when no title came with the game", () => {
    expect(momentLines({ ...none, achievementsUnlocked: ["Regular"] })).toEqual(["Regular unlocked"]);
  });
});
