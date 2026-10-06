import { describe, expect, it } from "vitest";
import { byRating, moveSeed, shuffleSeeds } from "@/lib/seeding";

const ids = ["a", "b", "c", "d"];

describe("moveSeed", () => {
  it("swaps a seed with its neighbour and clamps at the ends", () => {
    expect(moveSeed(ids, 2, -1)).toEqual(["a", "c", "b", "d"]);
    expect(moveSeed(ids, 2, 1)).toEqual(["a", "b", "d", "c"]);
    expect(moveSeed(ids, 0, -1)).toEqual(ids);
    expect(moveSeed(ids, 3, 1)).toEqual(ids);
  });
  it("does not mutate its input", () => {
    const copy = [...ids];
    moveSeed(ids, 1, 1);
    expect(ids).toEqual(copy);
  });
});

describe("shuffleSeeds", () => {
  it("is a permutation driven by the random source", () => {
    const seq = [0.9, 0.1, 0.5, 0.0];
    let i = 0;
    const out = shuffleSeeds(ids, () => seq[i++ % seq.length]);
    expect([...out].sort()).toEqual([...ids].sort());
    expect(out).not.toEqual(ids);
    expect(shuffleSeeds(ids, () => 0)).toEqual(["b", "c", "d", "a"]);
  });
  it("leaves a one-player list alone", () => {
    expect(shuffleSeeds(["a"], Math.random)).toEqual(["a"]);
  });
});

describe("byRating", () => {
  it("orders strongest first and breaks ties by name", () => {
    const rating = { a: 450, b: 520, c: 450, d: 610 };
    const name = { a: "Zoe", b: "Noah", c: "Ava", d: "Priya" };
    expect(byRating(ids, (id) => rating[id as keyof typeof rating], (id) => name[id as keyof typeof name])).toEqual([
      "d",
      "b",
      "c",
      "a",
    ]);
  });
});
