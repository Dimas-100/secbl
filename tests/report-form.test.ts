import { describe, expect, it } from "vitest";
import { recentOpponents, stepScore, submitState } from "@/lib/report-form";

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
    ]);
  });

  it("ignores ids no longer in the roster", () => {
    expect(recentOpponents(["ghost", "b"], roster, 2).map((o) => o.id)).toEqual(["b", "a"]);
  });

  it("pads alphabetically without duplicating history", () => {
    expect(recentOpponents(["d"], roster).map((o) => o.id)).toEqual(["d", "a", "b"]);
  });

  it("handles empty history", () => {
    expect(recentOpponents([], roster).map((o) => o.id)).toEqual(["a", "b", "c"]);
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
  it("narrates a win", () => {
    expect(submitState(5, 3, "Priya")).toEqual({
      label: "Report 5–3 win",
      disabled: false,
      reason: null,
    });
  });

  it("narrates a loss with your score first", () => {
    expect(submitState(3, 5, "Priya").label).toBe("Report 3–5 loss");
  });

  it("blocks ties, 0-0, and missing opponent", () => {
    expect(submitState(4, 4, "Priya")).toMatchObject({
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
