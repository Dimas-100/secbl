import { describe, expect, it } from "vitest";
import {
  RACES,
  canDecrement,
  canIncrement,
  finished,
  formatLabel,
  formatShort,
  needLine,
  raceProgress,
  raceSubmitState,
  startingScores,
  suggestedSpot,
  validateResult,
  type RaceState,
} from "@/lib/race";

const st = (over: Partial<RaceState>): RaceState => ({ you: 0, them: 0, raceTo: 5, spot: 0, spotTo: null, ...over });

describe("suggestedSpot", () => {
  it("gives nothing between equals and never reaches race_to", () => {
    expect(suggestedSpot(5, 500, 500)).toEqual({ spot: 0, to: null });
    expect(suggestedSpot(3, 900, 300)).toEqual({ spot: 2, to: "them" });
    for (const r of RACES) {
      for (const gap of [0, 50, 100, 200, 400, 800]) {
        const s = suggestedSpot(r, 400 + gap, 400);
        expect(s.spot).toBeGreaterThanOrEqual(0);
        expect(s.spot).toBeLessThan(r);
      }
    }
  });
  it("follows 2:1 odds per 100 points and is symmetric", () => {
    // The weaker player needs ceil(raceTo / odds) games — rounded up, so the
    // spot errs on the side of the better player.
    expect(suggestedSpot(3, 600, 500)).toEqual({ spot: 1, to: "them" }); // ceil(3/2)=2 → spot 1
    expect(suggestedSpot(5, 600, 500)).toEqual({ spot: 2, to: "them" }); // ceil(5/2)=3 → 2
    expect(suggestedSpot(5, 700, 500)).toEqual({ spot: 3, to: "them" }); // ceil(5/4)=2 → 3
    expect(suggestedSpot(5, 500, 700)).toEqual({ spot: 3, to: "you" });
    expect(suggestedSpot(5, 520, 500)).toEqual({ spot: 0, to: null }); // ceil(5/1.15)=5 → nothing
  });
});

describe("scores and progress", () => {
  it("pre-fills the receiver's spot", () => {
    expect(startingScores(5, 2, "them")).toEqual({ you: 0, them: 2 });
    expect(startingScores(5, 2, "you")).toEqual({ you: 2, them: 0 });
    expect(startingScores(null, 0, null)).toEqual({ you: 0, them: 0 });
    expect(startingScores(null, 2, "them")).toEqual({ you: 0, them: 0 });
  });
  it("fills the rail toward the finish, and not at all in open play", () => {
    expect(raceProgress(2, 5)).toBe(0.4);
    expect(raceProgress(7, 5)).toBe(1);
    expect(raceProgress(3, null)).toBe(0);
  });
  it("knows who finished and locks the score", () => {
    expect(finished(st({ you: 5, them: 3 }))).toBe("you");
    expect(finished(st({ you: 4, them: 5 }))).toBe("them");
    expect(finished(st({ you: 4, them: 4 }))).toBeNull();
    expect(finished(st({ you: 9, them: 2, raceTo: null }))).toBeNull();
    expect(canIncrement(st({ you: 5, them: 3 }), "them")).toBe(false);
    expect(canIncrement(st({ you: 4, them: 3 }), "you")).toBe(true);
    expect(canIncrement(st({ you: 98, them: 3, raceTo: null }), "you")).toBe(true);
    expect(canIncrement(st({ you: 99, them: 3, raceTo: null }), "you")).toBe(false);
  });
  it("never takes the receiver below their spot", () => {
    expect(canDecrement(st({ you: 0, them: 2, spot: 2, spotTo: "them" }), "them")).toBe(false);
    expect(canDecrement(st({ you: 0, them: 3, spot: 2, spotTo: "them" }), "them")).toBe(true);
    expect(canDecrement(st({ you: 0, them: 0 }), "you")).toBe(false);
    expect(canDecrement(st({ you: 1, them: 0 }), "you")).toBe(true);
  });
});

describe("copy", () => {
  it("labels the format", () => {
    expect(formatLabel(5, 0, null)).toBe("Race to 5");
    expect(formatLabel(5, 2, "Sam")).toBe("Race to 5 · 2 on the wire to Sam");
    expect(formatLabel(5, 1, "you")).toBe("Race to 5 · 1 on the wire to you");
    expect(formatLabel(null, 0, null)).toBeNull();
    expect(formatShort(5, 2)).toBe("race to 5 · 2 spot");
    expect(formatShort(5, 0)).toBe("race to 5");
    expect(formatShort(null, 0)).toBeNull();
  });
  it("says what each side still needs", () => {
    expect(needLine(st({ you: 2, them: 4 }), "Sam")).toBe("You need 3 · Sam needs 1");
    expect(needLine(st({ you: 5, them: 4 }), "Sam")).toBe("You win 5–4");
    expect(needLine(st({ you: 1, them: 5 }), "Sam")).toBe("Sam wins 5–1");
    expect(needLine(st({ you: 1, them: 0, raceTo: null }), "Sam")).toBe("Open play");
  });
  it("submits only a finished race, and open play like before", () => {
    expect(raceSubmitState(st({ you: 3, them: 2 }), "Sam")).toMatchObject({
      disabled: true,
      reason: "Race on — first to 5",
    });
    expect(raceSubmitState(st({ you: 5, them: 2 }), "Sam")).toMatchObject({
      disabled: false,
      label: "Send to Sam to confirm",
    });
    expect(raceSubmitState(st({ you: 5, them: 2 }), null)).toMatchObject({ disabled: true, reason: "Pick your opponent" });
    expect(raceSubmitState(st({ you: 3, them: 3, raceTo: null }), "Sam")).toMatchObject({
      disabled: true,
      reason: "Scores can't be equal",
    });
    expect(raceSubmitState(st({ you: 0, them: 0, raceTo: null }), "Sam")).toMatchObject({
      disabled: true,
      reason: "Enter the score",
    });
    expect(raceSubmitState(st({ you: 3, them: 1, raceTo: null }), "Sam")).toMatchObject({ disabled: false });
  });
});

describe("validateResult", () => {
  const base = { reporterId: "r", opponentId: "o", reporterScore: 5, opponentScore: 3 };
  it("accepts a finished race and open play, and names what is wrong otherwise", () => {
    expect(validateResult({ ...base, raceTo: 5, spot: 0, spotTo: null })).toBeNull();
    expect(validateResult({ ...base, raceTo: null, spot: 0, spotTo: null })).toBeNull();
    expect(validateResult({ ...base, raceTo: 5, spot: 2, spotTo: "o" })).toBeNull();
    expect(validateResult({ ...base, opponentScore: 5, raceTo: null, spot: 0, spotTo: null })).toBe("Scores can't be equal");
    expect(validateResult({ ...base, reporterScore: 4, raceTo: 5, spot: 0, spotTo: null })).toBe("That race isn't finished yet — first to 5");
    expect(validateResult({ ...base, opponentScore: 1, raceTo: 5, spot: 2, spotTo: "o" })).toBe("The spot receiver can't finish below their 2-game spot");
    expect(validateResult({ ...base, raceTo: 5, spot: 5, spotTo: "o" })).toBe("That spot doesn't fit the race");
    expect(validateResult({ ...base, raceTo: 5, spot: 1, spotTo: null })).toBe("That spot doesn't fit the race");
    expect(validateResult({ ...base, raceTo: 5, spot: 1, spotTo: "x" })).toBe("That spot doesn't fit the race");
    expect(validateResult({ ...base, raceTo: null, spot: 1, spotTo: "o" })).toBe("A spot needs a race");
  });
});
