import { describe, expect, it } from "vitest";
import {
  GAME_TYPES,
  boardParams,
  boardScored,
  duplicateNotice,
  duplicateSince,
  findDuplicate,
  foldSummary,
  laterTime,
  openingBoard,
  recentOpponents,
  resultLine,
  seededBoard,
  startBoard,
  stepScore,
  submitState,
  type PairMatchRow,
} from "@/lib/report-form";
import { RACES, suggestedSpot } from "@/lib/race";
import { rematchHref } from "@/lib/result-moment";

const roster = [
  { id: "a", display_name: "Ana" },
  { id: "b", display_name: "Ben" },
  { id: "c", display_name: "Cal" },
  { id: "d", display_name: "Dee" },
];

describe("recentOpponents", () => {
  it("keeps newest-first order and dedupes", () => {
    expect(recentOpponents(["c", "a", "c", "b"], roster).map((o) => o.id)).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("ignores ids no longer in the roster", () => {
    expect(recentOpponents(["ghost", "b"], roster, 2).map((o) => o.id)).toEqual(["b", "a"]);
  });

  it("pads alphabetically without duplicating history", () => {
    expect(recentOpponents(["d"], roster).map((o) => o.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("handles empty history", () => {
    expect(recentOpponents([], roster).map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("returns fewer than n when the roster is small", () => {
    expect(recentOpponents([], roster.slice(0, 2)).map((o) => o.id)).toEqual(["a", "b"]);
  });
});

describe("stepScore", () => {
  it("clamps at 0 and 99", () => {
    expect(stepScore(0, -1)).toBe(0);
    expect(stepScore(99, 1)).toBe(99);
    expect(stepScore(3, 1)).toBe(4);
    expect(stepScore(3, -1)).toBe(2);
  });
});

describe("submitState", () => {
  it("sends a valid result to the opponent to confirm", () => {
    expect(submitState(5, 3, "Priya")).toEqual({
      label: "Send to Priya to confirm",
      disabled: false,
      reason: null,
    });
    expect(submitState(3, 5, "Priya").disabled).toBe(false);
  });

  it("blocks ties, 0-0, and missing opponent", () => {
    expect(submitState(4, 4, "Priya")).toMatchObject({
      label: "Send to confirm",
      disabled: true,
      reason: "Scores can't be equal",
    });
    expect(submitState(0, 0, "Priya")).toMatchObject({
      disabled: true,
      reason: "Enter the score",
    });
    expect(submitState(5, 3, null)).toMatchObject({
      disabled: true,
      reason: "Pick your opponent",
    });
  });
});

describe("resultLine", () => {
  it("narrates the result from your side", () => {
    expect(resultLine(5, 3)).toEqual({ text: "Win 5–3", tone: "win" });
    expect(resultLine(3, 5)).toEqual({ text: "Loss 3–5", tone: "loss" });
  });

  it("prompts while the score is incomplete", () => {
    expect(resultLine(0, 0)).toEqual({ text: "Enter the score", tone: "muted" });
    expect(resultLine(4, 4)).toEqual({ text: "Scores can't be equal", tone: "muted" });
  });
});

// The 2026-10-15 incident: both players logged the same race to 3 seconds
// apart, so the second report has to find the first one first.
function row(over: Partial<PairMatchRow>): PairMatchRow {
  return {
    id: "m1",
    status: "pending",
    reporter_id: "ana",
    opponent_id: "ben",
    reporter_score: 3,
    opponent_score: 2,
    played_at: "2026-10-15",
    created_at: "2026-10-16T03:23:42Z",
    ...over,
  };
}

describe("findDuplicate since a club-night table call", () => {
  it("ignores games logged before the pair was called to the table", () => {
    const earlier = row({ status: "confirmed", created_at: "2026-10-15T20:00:00Z" });
    expect(findDuplicate([earlier], "ben", "ana", "2026-10-15", "2026-10-15T21:00:00Z")).toBeNull();
    expect(findDuplicate([earlier], "ben", "ana", "2026-10-15", "2026-10-15T19:00:00Z")).toMatchObject({ id: "m1" });
    expect(findDuplicate([earlier], "ben", "ana", "2026-10-15", null)).toMatchObject({ id: "m1" });
  });
});

// Spec 2026-10-21-play-and-progress §3 and ruling S4-R6: a Rematch board's
// check starts at the game it rematches (that game's created_at), so the game
// it follows is not a duplicate, but every report of the rematch itself is
// still caught, however late the board was opened.
describe("findDuplicate since the rematched game", () => {
  const first = row({ id: "first", status: "confirmed", created_at: "2026-10-15T20:00:00.123456+00:00" });
  const anchor = first.created_at;
  it("ignores the rematched game itself and anything logged before it", () => {
    const older = row({ id: "older", status: "confirmed", created_at: "2026-10-15T19:00:00Z" });
    expect(findDuplicate([first, older], "ben", "ana", "2026-10-15", anchor)).toBeNull();
  });
  it("still finds the opponent's report of the rematch", () => {
    const theirs = row({ id: "theirs", created_at: "2026-10-15T20:31:00Z" });
    expect(findDuplicate([first, theirs], "ben", "ana", "2026-10-15", anchor)?.id).toBe("theirs");
  });
  it("finds it when they logged the rematch before this board was even opened", () => {
    // The 2026-10-15 double count: the opponent sent the rematch at 20:10,
    // this board opened at 20:40. The anchor is the game, not the opening.
    const theirs = row({ id: "theirs", created_at: "2026-10-15T20:10:00Z" });
    expect(findDuplicate([first, theirs], "ben", "ana", "2026-10-15", anchor)?.id).toBe("theirs");
  });
  it("catches a report a second after the rematched game", () => {
    const quick = row({ id: "quick", created_at: "2026-10-15T20:00:01Z" });
    expect(findDuplicate([first, quick], "ben", "ana", "2026-10-15", anchor)?.id).toBe("quick");
  });
});

describe("laterTime", () => {
  const board = "2026-10-15T20:05:00Z";
  const call = "2026-10-15T21:00:00+00:00";
  it("takes the later of the rematched game's time and the table call", () => {
    expect(laterTime(board, call)).toBe(call);
    expect(laterTime("2026-10-15T21:30:00Z", call)).toBe("2026-10-15T21:30:00Z");
  });
  it("takes whichever one there is, and ignores what isn't a time", () => {
    expect(laterTime(board, null)).toBe(board);
    expect(laterTime(null, call)).toBe(call);
    expect(laterTime(null, null)).toBeNull();
    expect(laterTime("not a time", call)).toBe(call);
    expect(laterTime("not a time", undefined)).toBeNull();
  });
});

describe("duplicateSince", () => {
  const now = new Date("2026-10-15T22:00:00Z");
  const call = "2026-10-15T21:00:00+00:00";
  it("starts the check at the later of the rematched game's time and the table call", () => {
    expect(duplicateSince("2026-10-15T21:30:00Z", call, now)).toBe("2026-10-15T21:30:00Z");
    expect(duplicateSince("2026-10-15T20:05:00Z", call, now)).toBe(call);
    expect(duplicateSince("2026-10-15T20:05:00Z", null, now)).toBe("2026-10-15T20:05:00Z");
    expect(duplicateSince(null, null, now)).toBeNull();
  });
  it("does not trust a time after the server's now: the check stays strict", () => {
    expect(duplicateSince("2026-10-15T23:00:00Z", null, now)).toBeNull();
    expect(duplicateSince("2026-10-15T23:00:00Z", call, now)).toBe(call);
    expect(duplicateSince("garbage", null, now)).toBeNull();
  });
  it("keeps the opponent's report of the rematch in view when the time is ignored", () => {
    // A time an hour ahead (edited or skewed): trusted, it would hide their report.
    const theirs = row({ id: "theirs", created_at: "2026-10-15T21:40:00Z" });
    const since = duplicateSince("2026-10-15T23:00:00Z", null, now);
    expect(findDuplicate([theirs], "ben", "ana", "2026-10-15", since)?.id).toBe("theirs");
  });
});

describe("boardParams", () => {
  const id = "0b9e6a4c-2f1d-4c3e-9a8b-7c6d5e4f3a21";
  it("reads the game, the race, the rematch flag and the rematched game", () => {
    expect(boardParams({ game: "9ball", race: "7", rematch: "1", after: id })).toEqual({
      game: "9ball",
      raceTo: 7,
      rematch: true,
      after: id,
    });
  });
  it("reads an open race", () => {
    expect(boardParams({ game: "8ball", race: "open" })).toEqual({ game: "8ball", raceTo: "open", rematch: false, after: null });
  });
  it("takes the rematched game only as a UUID", () => {
    for (const after of ["m1", "", `${id} `, `${id},x`, "not-a-uuid-at-all-0000-000000000000", "constructor"]) {
      expect(boardParams({ rematch: "1", after }).after).toBeNull();
    }
    expect(boardParams({ rematch: "1", after: id.toUpperCase() }).after).toBe(id.toUpperCase());
  });
  it("accepts every game and race the scoreboard offers", () => {
    for (const g of GAME_TYPES) expect(boardParams({ game: g.value }).game).toBe(g.value);
    for (const r of RACES) expect(boardParams({ race: String(r) }).raceTo).toBe(r);
  });
  it("ignores values the scoreboard doesn't offer", () => {
    expect(boardParams({ game: "snooker", race: "99", rematch: "yes" })).toEqual({
      game: null,
      raceTo: null,
      rematch: false,
      after: null,
    });
    for (const race of ["4", "0", "-3", "5.0", " 5", "", "Open"]) expect(boardParams({ race }).raceTo).toBeNull();
    expect(boardParams({ game: "constructor" }).game).toBeNull();
    expect(boardParams({})).toEqual({ game: null, raceTo: null, rematch: false, after: null });
  });
  it("round-trips the result screen's Rematch link, open race included", () => {
    for (const raceTo of [3, 9, null]) {
      const href = rematchHref({ opponentId: "opp-1", gameType: "10ball", raceTo, matchId: id });
      const sp = Object.fromEntries(new URL(href, "https://club.test").searchParams);
      expect(sp.opponent).toBe("opp-1");
      expect(boardParams(sp)).toEqual({ game: "10ball", raceTo: raceTo ?? "open", rematch: true, after: id });
    }
  });
});

describe("seededBoard", () => {
  it("without a seed is the board a called opponent always got", () => {
    expect(seededBoard(boardParams({}), 650, 450, 5)).toEqual({ game: "8ball", ...startBoard(650, 450, 5) });
  });
  it("takes a Rematch link's game and race, and suggests the spot afresh from today's ratings", () => {
    const s = suggestedSpot(3, 450, 650);
    expect(s.spot).toBeGreaterThan(0);
    expect(seededBoard({ game: "9ball", raceTo: 3, rematch: true, after: null }, 650, 450, 5)).toEqual({
      game: "9ball",
      raceTo: 3,
      spot: s.spot,
      spotTo: "you",
      you: s.spot,
      them: 0,
    });
  });
  it("opens an open race with no spot", () => {
    expect(seededBoard({ game: "10ball", raceTo: "open", rematch: true, after: null }, 650, 450, 5)).toEqual({
      game: "10ball",
      raceTo: null,
      spot: 0,
      spotTo: null,
      you: 0,
      them: 0,
    });
  });
});

describe("foldSummary", () => {
  const today = "2026-10-21";
  const on = { date: today };
  it("names the game, the race and an even race", () => {
    expect(foldSummary({ game: "8ball", raceTo: 5, spot: 0, spotTo: null, ...on }, "Ana", today)).toBe(
      "8-ball · race to 5 · no spot"
    );
  });
  it("names the spot and who has it", () => {
    expect(foldSummary({ game: "9ball", raceTo: 7, spot: 2, spotTo: "them", ...on }, "Ana", today)).toBe(
      "9-ball · race to 7 · 2 on the wire to Ana"
    );
    expect(foldSummary({ game: "10ball", raceTo: 3, spot: 1, spotTo: "you", ...on }, "Ana", today)).toBe(
      "10-ball · race to 3 · 1 on the wire to you"
    );
  });
  it("says open race in open play", () => {
    expect(foldSummary({ game: "other", raceTo: null, spot: 0, spotTo: null, ...on }, "Ana", today)).toBe(
      "Other · open race · no spot"
    );
  });
  it("names the day when the game isn't today's, so a backdated game never hides it (ruling S4-R7)", () => {
    const d = { game: "8ball", raceTo: 5, spot: 0, spotTo: null };
    expect(foldSummary({ ...d, date: "2026-10-19" }, "Ana", today)).toBe("8-ball · race to 5 · no spot · Oct 19");
    expect(foldSummary({ ...d, date: "2025-12-12" }, "Ana", today)).toBe("8-ball · race to 5 · no spot · Dec 12, 2025");
  });
});

describe("boardScored", () => {
  it("is false on the starting scores: even, spotted either way, open play", () => {
    expect(boardScored({ raceTo: 5, spot: 0, spotTo: null, you: 0, them: 0 })).toBe(false);
    expect(boardScored({ raceTo: 5, spot: 2, spotTo: "you", you: 2, them: 0 })).toBe(false);
    expect(boardScored({ raceTo: 5, spot: 2, spotTo: "them", you: 0, them: 2 })).toBe(false);
    expect(boardScored({ raceTo: null, spot: 0, spotTo: null, you: 0, them: 0 })).toBe(false);
  });
  it("is true once either score moves off the start", () => {
    expect(boardScored({ raceTo: 5, spot: 0, spotTo: null, you: 3, them: 2 })).toBe(true);
    expect(boardScored({ raceTo: 5, spot: 2, spotTo: "you", you: 2, them: 1 })).toBe(true);
    expect(boardScored({ raceTo: 5, spot: 2, spotTo: "them", you: 0, them: 3 })).toBe(true);
    expect(boardScored({ raceTo: null, spot: 0, spotTo: null, you: 0, them: 1 })).toBe(true);
  });
  it("counts a spotted side reset below its start as moved", () => {
    expect(boardScored({ raceTo: 5, spot: 2, spotTo: "you", you: 0, them: 0 })).toBe(true);
  });
});

describe("openingBoard", () => {
  const even = { raceTo: 5, spot: 0, spotTo: null } as const;
  const scored = { opponentId: "a", ...even, you: 2, them: 1 };
  it("keeps the draft when nobody was called", () => {
    expect(openingBoard(scored, undefined)).toBe("keep");
  });
  it("keeps the draft when it is already against the called opponent", () => {
    expect(openingBoard(scored, "a")).toBe("keep");
  });
  it("asks before replacing a scored game against someone else", () => {
    expect(openingBoard(scored, "b")).toBe("ask");
    expect(openingBoard({ opponentId: "a", ...even, you: 0, them: 3 }, "b")).toBe("ask");
  });
  it("switches silently from an unscored board", () => {
    expect(openingBoard({ opponentId: "a", ...even, you: 0, them: 0 }, "b")).toBe("switch");
  });
  it("switches when the draft has no opponent yet", () => {
    expect(openingBoard({ opponentId: null, ...even, you: 0, them: 0 }, "b")).toBe("switch");
    expect(openingBoard({ opponentId: null, ...even, you: 1, them: 0 }, "b")).toBe("switch");
  });
  it("treats an untouched spotted board as unscored", () => {
    const spotted = { opponentId: "a", raceTo: 5, spot: 2, spotTo: "you" } as const;
    expect(openingBoard({ ...spotted, you: 2, them: 0 }, "b")).toBe("switch");
    expect(openingBoard({ ...spotted, spotTo: "them", you: 0, them: 2 }, "b")).toBe("switch");
  });
  it("asks once a point is played beyond the spot's start", () => {
    const spotted = { opponentId: "a", raceTo: 5, spot: 2, spotTo: "you" } as const;
    expect(openingBoard({ ...spotted, you: 3, them: 0 }, "b")).toBe("ask");
    expect(openingBoard({ ...spotted, you: 2, them: 1 }, "b")).toBe("ask");
  });
  it("on open play, any score counts", () => {
    const open = { opponentId: "a", raceTo: null, spot: 0, spotTo: null } as const;
    expect(openingBoard({ ...open, you: 0, them: 0 }, "b")).toBe("switch");
    expect(openingBoard({ ...open, you: 1, them: 0 }, "b")).toBe("ask");
  });
});

describe("startBoard", () => {
  it("sets up the board a newly picked opponent gets: suggested spot, starting scores", () => {
    expect(startBoard(450, 450, 5)).toEqual({ raceTo: 5, spot: 0, spotTo: null, you: 0, them: 0 });
    const s = suggestedSpot(5, 450, 650);
    const board = startBoard(650, 450, 5);
    expect(s.spot).toBeGreaterThan(0);
    expect(board).toEqual({ raceTo: 5, spot: s.spot, spotTo: "you", you: s.spot, them: 0 });
  });
});

describe("findDuplicate", () => {
  it("finds the opponent's pending report of the same day, from your side", () => {
    expect(findDuplicate([row({})], "ben", "ana", "2026-10-15")).toEqual({
      id: "m1",
      status: "pending",
      reportedByMe: false,
      myScore: 2,
      theirScore: 3,
      playedAt: "2026-10-15",
    });
  });

  it("finds your own pending report", () => {
    expect(findDuplicate([row({})], "ana", "ben", "2026-10-15")).toMatchObject({
      reportedByMe: true,
      myScore: 3,
      theirScore: 2,
    });
  });

  it("finds a confirmed game in either direction", () => {
    expect(findDuplicate([row({ status: "confirmed" })], "ben", "ana", "2026-10-15")).toMatchObject({
      id: "m1",
      status: "confirmed",
    });
  });

  it("ignores another day, another pair, and rejected or disputed games", () => {
    const rows = [
      row({ id: "other-day", played_at: "2026-10-14" }),
      row({ id: "other-pair", reporter_id: "cal" }),
      row({ id: "rejected", status: "rejected" }),
      row({ id: "disputed", status: "disputed" }),
    ];
    expect(findDuplicate(rows, "ben", "ana", "2026-10-15")).toBeNull();
    expect(findDuplicate([], "ben", "ana", "2026-10-15")).toBeNull();
  });

  it("prefers the report waiting on you over a newer game", () => {
    const rows = [
      row({ id: "waiting", created_at: "2026-10-15T20:00:00Z" }),
      row({ id: "newer", status: "confirmed", reporter_id: "ben", opponent_id: "ana", created_at: "2026-10-15T22:00:00Z" }),
    ];
    expect(findDuplicate(rows, "ben", "ana", "2026-10-15")?.id).toBe("waiting");
  });

  it("otherwise takes the newest", () => {
    const rows = [
      row({ id: "old", status: "confirmed", created_at: "2026-10-15T20:00:00Z" }),
      row({ id: "new", status: "confirmed", created_at: "2026-10-15T22:00:00Z" }),
    ];
    expect(findDuplicate(rows, "ben", "ana", "2026-10-15")?.id).toBe("new");
  });
});

describe("duplicateNotice", () => {
  const base = { id: "m1", playedAt: "2026-10-15" } as const;

  it("offers to confirm the opponent's report that is waiting on you", () => {
    expect(
      duplicateNotice({ ...base, status: "pending", reportedByMe: false, myScore: 2, theirScore: 3 }, "Ana", "2026-10-15")
    ).toEqual({
      title: "Ana already logged this game",
      detail: "Ana won 3–2 today — waiting on you.",
      canConfirm: true,
    });
  });

  it("reminds you of your own report still waiting on them", () => {
    expect(
      duplicateNotice({ ...base, status: "pending", reportedByMe: true, myScore: 3, theirScore: 2 }, "Ben", "2026-10-17")
    ).toEqual({
      title: "You already sent this game",
      detail: "You won 3–2 on Oct 15 — waiting on Ben.",
      canConfirm: false,
    });
  });

  it("names a confirmed game without offering to confirm it", () => {
    expect(
      duplicateNotice({ ...base, status: "confirmed", reportedByMe: false, myScore: 2, theirScore: 3 }, "Ana", "2026-10-15")
    ).toEqual({
      title: "You and Ana already have a game today",
      detail: "Ana won 3–2 — confirmed.",
      canConfirm: false,
    });
  });
});
