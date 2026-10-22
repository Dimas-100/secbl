import { describe, expect, it } from "vitest";
import { emptySchoolsLine, gapLine, movementLabel, placingTag } from "@/lib/ranks";
import type { RankRow } from "@/lib/ranking";

const row = (id: string, rating: number, wins = 1, losses = 0): RankRow => ({ id, rating, wins, losses });

describe("movementLabel", () => {
  it("reads a climb as a win-toned up arrow", () => {
    expect(movementLabel(36)).toEqual({ text: "▲ 36", tone: "win" });
  });
  it("reads a drop as a loss-toned down arrow", () => {
    expect(movementLabel(-14)).toEqual({ text: "▼ 14", tone: "loss" });
  });
  it("shows nothing for zero or no movement", () => {
    expect(movementLabel(0)).toBeNull();
    expect(movementLabel(undefined)).toBeNull();
  });
});

describe("placingTag", () => {
  it("tags 1 to 9 confirmed games", () => {
    expect(placingTag(1)).toBe("placing 1/10");
    expect(placingTag(9)).toBe("placing 9/10");
  });
  it("drops the tag at 0 and from 10 on", () => {
    expect(placingTag(0)).toBeNull();
    expect(placingTag(10)).toBeNull();
    expect(placingTag(25)).toBeNull();
  });
});

describe("gapLine", () => {
  const rows = [row("a", 560), row("b", 542), row("c", 541), row("d", 541, 0, 1), row("fresh", 450, 0, 0)];

  it("counts the points to the member directly above", () => {
    expect(gapLine(rows, "b")).toBe("18 pts to #1");
  });
  it("says 1 pt, singular, at a gap of 1", () => {
    expect(gapLine(rows, "c")).toBe("1 pt to #2");
  });
  it("says level on rating at a gap of 0, never 0 pts", () => {
    expect(gapLine(rows, "d")).toBe("level on rating with #3");
  });
  it("is null for #1, an unplaced member and a missing id", () => {
    expect(gapLine(rows, "a")).toBeNull();
    expect(gapLine(rows, "fresh")).toBeNull();
    expect(gapLine(rows, "nobody")).toBeNull();
  });
  it("follows the rows given, so a narrower scope has its own order", () => {
    expect(gapLine([row("b", 542), row("d", 541, 0, 1)], "d")).toBe("1 pt to #1");
  });
});

describe("emptySchoolsLine", () => {
  it("joins the empty schools' short names in input order", () => {
    const line = emptySchoolsLine([
      { short_name: "UGA", member_count: 0 },
      { short_name: "AAA", member_count: 4 },
      { short_name: "KSU", member_count: 0 },
    ]);
    expect(line).toBe("Not here yet: UGA · KSU");
  });
  it("is null when every school has members", () => {
    expect(emptySchoolsLine([{ short_name: "AAA", member_count: 2 }])).toBeNull();
    expect(emptySchoolsLine([])).toBeNull();
  });
});
