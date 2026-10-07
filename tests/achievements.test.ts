import { describe, expect, it } from "vitest";
import { earnedAchievements } from "@/lib/achievements";

describe("season champion", () => {
  const base = { viewerId: "a", rating: 450, peak: 450, matches: [], opponentRatings: {}, tournamentsWon: 0 };
  it("is earned by a closed season's champion", () => {
    expect(earnedAchievements({ ...base, seasonsWon: 0 }).map((a) => a.id)).not.toContain("season-champion");
    expect(earnedAchievements({ ...base, seasonsWon: 1 }).map((a) => a.id)).toContain("season-champion");
  });
});
