import { describe, expect, it } from "vitest";
import { byRating, shuffleSeeds, toggleSeed } from "@/lib/seeding";

const ids = ["a", "b", "c", "d"];

describe("toggleSeed", () => {
  it("appends a new player as the last seed and removes a seeded one, closing the gap", () => {
    expect(toggleSeed(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(toggleSeed(["a", "b", "c"], "a")).toEqual(["b", "c"]);
    expect(toggleSeed([], "a")).toEqual(["a"]);
  });
  it("does not mutate its input", () => {
    const copy = [...ids];
    toggleSeed(ids, "b");
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
