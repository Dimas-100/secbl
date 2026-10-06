import { describe, expect, it } from "vitest";
import { BALLS, ballFor, ballStyle, greetingFor } from "@/lib/identity";
import { earnedAchievements, type AchievementInput } from "@/lib/achievements";

describe("balls", () => {
  it("defines the fifteen object balls with solids 1–7, the 8, and stripes 9–15", () => {
    expect(BALLS).toHaveLength(15);
    expect(BALLS[0]).toMatchObject({ number: 1, stripe: false });
    expect(BALLS[7]).toMatchObject({ number: 8, stripe: false });
    expect(BALLS[8]).toMatchObject({ number: 9, stripe: true });
    expect(BALLS[14]).toMatchObject({ number: 15, stripe: true });
    // A stripe shares its colour with the solid seven below it.
    expect(BALLS[8].color).toBe(BALLS[0].color);
  });
  it("falls back to a stable ball from the profile id when none is chosen", () => {
    expect(ballFor(null, "0a0b0c0d-0000-0000-0000-000000000000").number).toBe(
      ballFor(null, "0a0b0c0d-0000-0000-0000-000000000000").number
    );
    expect(ballFor(12, "x").number).toBe(12);
    expect(ballFor(99, "x").number).toBeGreaterThanOrEqual(1);
    expect(ballFor(99, "x").number).toBeLessThanOrEqual(15);
  });
  it("styles stripes with a white band and gives the 8-ball white text", () => {
    expect(ballStyle(BALLS[7]).color).toBe("#ffffff");
    expect(ballStyle(BALLS[8]).backgroundImage).toContain("#ffffff");
    expect(ballStyle(BALLS[0]).backgroundImage).toBeUndefined();
  });
});

describe("greetingFor", () => {
  it("follows the club clock", () => {
    expect(greetingFor(new Date("2026-10-05T13:00:00Z"), "Dimas")).toBe("Good morning, Dimas"); // 9am ET
    expect(greetingFor(new Date("2026-10-05T18:00:00Z"), "Dimas")).toBe("Good afternoon, Dimas"); // 2pm
    expect(greetingFor(new Date("2026-10-06T01:00:00Z"), "Dimas")).toBe("Good evening, Dimas"); // 9pm
    expect(greetingFor(new Date("2026-10-06T06:00:00Z"), "Dimas")).toBe("Late night, Dimas"); // 2am
  });
  it("uses the first name only", () => {
    expect(greetingFor(new Date("2026-10-05T13:00:00Z"), "Dennis Gomez")).toBe("Good morning, Dennis");
  });
});

describe("earnedAchievements", () => {
  const base: AchievementInput = {
    viewerId: "me",
    rating: 450,
    peak: 450,
    matches: [],
    opponentRatings: {},
    tournamentsWon: 0,
  };
  const win = (id: string, opp: string, mine = 5, theirs = 3) => ({
    id,
    reporter_id: "me",
    opponent_id: opp,
    winner_id: "me",
    reporter_score: mine,
    opponent_score: theirs,
    confirmed_at: "2026-10-01T00:00:00Z",
  });
  const loss = (id: string, opp: string) => ({ ...win(id, opp, 2, 5), winner_id: opp });

  it("is empty for a brand-new member", () => {
    expect(earnedAchievements(base)).toEqual([]);
  });

  it("awards first win, regular, heater, shutout and giant killer from match history", () => {
    const matches = [
      win("1", "a", 5, 0), // shutout
      win("2", "b"),
      win("3", "c"),
      win("4", "d"),
      win("5", "e"), // five straight → heater
      loss("6", "f"),
      win("7", "g"),
      win("8", "h"),
      win("9", "i"),
      win("10", "j"), // ten matches → regular
    ];
    const ids = earnedAchievements({
      ...base,
      matches,
      opponentRatings: { a: 400, b: 400, c: 400, d: 400, e: 510, f: 400, g: 400, h: 400, i: 400, j: 400 },
    }).map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining(["first-win", "regular", "heater", "shutout", "giant-killer"])
    );
    expect(ids).not.toContain("veteran");
    expect(ids).not.toContain("five-hundred");
  });

  it("awards rating clubs from peak and champion from tournaments", () => {
    const ids = earnedAchievements({ ...base, peak: 612, tournamentsWon: 1 }).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["five-hundred", "six-hundred", "champion"]));
  });

  it("returns achievements in catalogue order with labels", () => {
    const earned = earnedAchievements({ ...base, peak: 500, matches: [win("1", "a")], opponentRatings: { a: 1 } });
    expect(earned.map((a) => a.id)).toEqual(["first-win", "five-hundred"]);
    expect(earned[0].label).toBe("First win");
  });
});
