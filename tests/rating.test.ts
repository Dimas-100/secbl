import { describe, expect, it } from "vitest";
import {
  expectedScore,
  kFactor,
  ratingUpdate,
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
