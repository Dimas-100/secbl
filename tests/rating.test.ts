import { describe, expect, it } from "vitest";
import {
  expectedScore,
  kFactor,
  ratingUpdate,
  replayRatings,
  K_PROVISIONAL,
  K_STANDARD,
  PROVISIONAL_GAMES,
  RATING_FLOOR,
  STARTING_RATING,
} from "@/lib/rating";

describe("expectedScore", () => {
  it("is 0.5 for equal ratings", () => {
    expect(expectedScore(450, 450)).toBeCloseTo(0.5, 10);
  });

  it("gives a 100-point favorite 2:1 odds (Fargo curve)", () => {
    expect(expectedScore(550, 450)).toBeCloseTo(2 / 3, 10);
    expect(expectedScore(450, 550)).toBeCloseTo(1 / 3, 10);
  });

  it("is symmetric: probabilities sum to 1", () => {
    expect(expectedScore(612, 388) + expectedScore(388, 612)).toBeCloseTo(1, 10);
  });
});

describe("kFactor", () => {
  it("is provisional (64) for the first 10 matches", () => {
    expect(kFactor(0)).toBe(K_PROVISIONAL);
    expect(kFactor(PROVISIONAL_GAMES - 1)).toBe(K_PROVISIONAL);
  });

  it("is standard (32) from the 11th match on", () => {
    expect(kFactor(PROVISIONAL_GAMES)).toBe(K_STANDARD);
    expect(kFactor(100)).toBe(K_STANDARD);
  });
});

describe("ratingUpdate", () => {
  it("moves an even, established matchup by ±16", () => {
    expect(ratingUpdate(450, 450, true, 20)).toEqual({ delta: 16, newRating: 466 });
    expect(ratingUpdate(450, 450, false, 20)).toEqual({ delta: -16, newRating: 434 });
  });

  it("rewards a provisional underdog win heavily", () => {
    // K=64, expected 1/3 -> round(64 * 2/3) = 43
    expect(ratingUpdate(450, 550, true, 0)).toEqual({ delta: 43, newRating: 493 });
  });

  it("penalizes an established favorite loss moderately", () => {
    // K=32, expected 2/3 -> round(32 * -2/3) = -21
    expect(ratingUpdate(550, 450, false, 20)).toEqual({ delta: -21, newRating: 529 });
  });

  it("clamps at the rating floor", () => {
    const result = ratingUpdate(RATING_FLOOR + 5, RATING_FLOOR + 5, false, 20);
    expect(result.delta).toBe(-16);
    expect(result.newRating).toBe(RATING_FLOOR);
  });

  it("uses the documented starting rating", () => {
    expect(STARTING_RATING).toBe(450);
  });
});

describe("replayRatings", () => {
  const ids = ["a", "b"];

  it("reproduces a single match exactly as ratingUpdate would", () => {
    const result = replayRatings(
      [{ id: "m1", reporter_id: "a", opponent_id: "b", winner_id: "a" }],
      ids
    );
    const expected = ratingUpdate(STARTING_RATING, STARTING_RATING, true, 0);
    const a = result.standings.find((s) => s.profile_id === "a")!;
    const b = result.standings.find((s) => s.profile_id === "b")!;
    expect(a.rating).toBe(expected.newRating);
    expect(b.rating).toBe(STARTING_RATING - expected.delta);
    expect(a.matches_played).toBe(1);
    expect(b.matches_played).toBe(1);
  });

  it("computes both players from the same pre-match snapshot", () => {
    // If it used A's updated rating when computing B, the deltas would not be
    // equal and opposite for an even first meeting.
    const { deltas } = replayRatings(
      [{ id: "m1", reporter_id: "a", opponent_id: "b", winner_id: "a" }],
      ids
    );
    expect(deltas[0].rating_delta_reporter).toBe(-deltas[0].rating_delta_opponent);
  });

  it("is deterministic and depends on order", () => {
    const forward = replayRatings(
      [
        { id: "m1", reporter_id: "a", opponent_id: "b", winner_id: "a" },
        { id: "m2", reporter_id: "a", opponent_id: "b", winner_id: "b" },
      ],
      ids
    );
    const again = replayRatings(
      [
        { id: "m1", reporter_id: "a", opponent_id: "b", winner_id: "a" },
        { id: "m2", reporter_id: "a", opponent_id: "b", winner_id: "b" },
      ],
      ids
    );
    expect(again.standings).toEqual(forward.standings);
    // Two results that cancel do not return to the start, because the second
    // match is rated against ratings the first one moved.
    const a = forward.standings.find((s) => s.profile_id === "a")!;
    expect(a.matches_played).toBe(2);
    // The values, not just the shape: a path-independent implementation would
    // rate match 2 at 450 v 450 again, the deltas would cancel, and both would
    // land back on exactly 450.
    const b = forward.standings.find((s) => s.profile_id === "b")!;
    expect(a.rating).toBe(443);
    expect(b.rating).toBe(457);
  });

  it("emits one history row per player per match", () => {
    const { history } = replayRatings(
      [
        { id: "m1", reporter_id: "a", opponent_id: "b", winner_id: "a" },
        { id: "m2", reporter_id: "b", opponent_id: "a", winner_id: "b" },
      ],
      ids
    );
    expect(history).toHaveLength(4);
    expect(history.filter((h) => h.match_id === "m1")).toHaveLength(2);
    expect(history.every((h) => h.rating_before !== h.rating_after)).toBe(true);
  });

  it("starts everyone at the documented starting rating", () => {
    const { standings } = replayRatings([], ["a", "b", "c"]);
    expect(standings).toHaveLength(3);
    for (const s of standings) {
      expect(s.rating).toBe(STARTING_RATING);
      expect(s.matches_played).toBe(0);
    }
  });

  it("rates a player who appears only as an opponent", () => {
    const { standings } = replayRatings(
      [{ id: "m1", reporter_id: "a", opponent_id: "c", winner_id: "c" }],
      ["a", "b", "c"]
    );
    expect(standings.find((s) => s.profile_id === "c")!.matches_played).toBe(1);
    expect(standings.find((s) => s.profile_id === "b")!.rating).toBe(STARTING_RATING);
  });

  it("drops to the standard K-factor on a player's eleventh match", () => {
    // "a" wins ten matches against fresh opponents, so the eleventh is the
    // first rated with matches_played = 10.
    const ids = ["a", ...Array.from({ length: 11 }, (_, i) => `o${i + 1}`)];
    const matches = Array.from({ length: 11 }, (_, i) => ({
      id: `m${i + 1}`,
      reporter_id: "a",
      opponent_id: `o${i + 1}`,
      winner_id: "a",
    }));
    const { history } = replayRatings(matches, ids);

    const mine = history.find((h) => h.match_id === "m11" && h.profile_id === "a")!;
    const theirs = history.find((h) => h.match_id === "m11" && h.profile_id === "o11")!;
    const actual = mine.rating_after - mine.rating_before;

    // The eleventh match must be rated with K=32, not the provisional K=64.
    expect(actual).toBe(
      ratingUpdate(mine.rating_before, theirs.rating_before, true, PROVISIONAL_GAMES).delta
    );
    expect(actual).not.toBe(
      ratingUpdate(mine.rating_before, theirs.rating_before, true, PROVISIONAL_GAMES - 1).delta
    );
  });
});
