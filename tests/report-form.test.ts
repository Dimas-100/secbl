import { describe, expect, it } from "vitest";
import {
  duplicateNotice,
  findDuplicate,
  openingBoard,
  recentOpponents,
  resultLine,
  startBoard,
  stepScore,
  submitState,
  type PairMatchRow,
} from "@/lib/report-form";
import { suggestedSpot } from "@/lib/race";

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

describe("openingBoard", () => {
  const scored = { opponentId: "a", you: 2, them: 1 };
  it("keeps the draft when nobody was called", () => {
    expect(openingBoard(scored, undefined)).toBe("keep");
  });
  it("keeps the draft when it is already against the called opponent", () => {
    expect(openingBoard(scored, "a")).toBe("keep");
  });
  it("asks before replacing a scored game against someone else", () => {
    expect(openingBoard(scored, "b")).toBe("ask");
    expect(openingBoard({ opponentId: "a", you: 0, them: 3 }, "b")).toBe("ask");
  });
  it("switches silently from an unscored board", () => {
    expect(openingBoard({ opponentId: "a", you: 0, them: 0 }, "b")).toBe("switch");
  });
  it("switches when the draft has no opponent yet", () => {
    expect(openingBoard({ opponentId: null, you: 0, them: 0 }, "b")).toBe("switch");
    expect(openingBoard({ opponentId: null, you: 1, them: 0 }, "b")).toBe("switch");
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
