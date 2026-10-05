import { describe, expect, it } from "vitest";
import { formStrip, winnerDelta } from "@/lib/form";

describe("formStrip", () => {
  it("marks each match won or lost from the viewer's side", () => {
    const strip = formStrip(
      [
        { id: "1", winner_id: "me" },
        { id: "2", winner_id: "them" },
      ],
      "me"
    );
    expect(strip).toEqual([
      { id: "1", won: true },
      { id: "2", won: false },
    ]);
  });
});

describe("winnerDelta", () => {
  it("picks the reporter's delta when the reporter won", () => {
    expect(
      winnerDelta({ reporter_id: "r", winner_id: "r", rating_delta_reporter: 32, rating_delta_opponent: -32 })
    ).toBe(32);
  });
  it("picks the opponent's delta when the opponent won", () => {
    expect(
      winnerDelta({ reporter_id: "r", winner_id: "o", rating_delta_reporter: -18, rating_delta_opponent: 18 })
    ).toBe(18);
  });
  it("is null before deltas are stamped", () => {
    expect(
      winnerDelta({ reporter_id: "r", winner_id: "o", rating_delta_reporter: null, rating_delta_opponent: null })
    ).toBeNull();
  });
});
