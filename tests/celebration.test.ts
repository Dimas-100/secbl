import { describe, expect, it } from "vitest";
import {
  CELEBRATE_WINDOW_MS,
  dismissedIds,
  freshMatch,
  headline,
  streakTier,
  withDismissed,
  type CelebrationMatch,
} from "@/lib/celebration";

const now = new Date("2026-10-07T20:00:00Z");
const m = (id: string, confirmedAt: string | null, winner = "me"): CelebrationMatch => ({
  id,
  reporter_id: "me",
  opponent_id: "them",
  winner_id: winner,
  reporter_score: winner === "me" ? 5 : 3,
  opponent_score: winner === "me" ? 3 : 5,
  confirmed_at: confirmedAt,
});

describe("freshMatch", () => {
  it("is the newest confirmed match inside the window, else null", () => {
    expect(CELEBRATE_WINDOW_MS).toBe(24 * 3_600_000);
    expect(freshMatch([m("a", "2026-10-07T19:00:00Z"), m("b", "2026-10-06T19:00:00Z")], now)?.id).toBe("a");
    expect(freshMatch([m("old", "2026-10-06T19:00:00Z")], now)).toBeNull();
    expect(freshMatch([m("x", null)], now)).toBeNull();
    expect(freshMatch([], now)).toBeNull();
  });
});

describe("headline", () => {
  it("reads from the viewer's side with the opponent's first name", () => {
    expect(headline(m("a", null), "me", "Maya Chen")).toBe("Won 5–3 vs Maya");
    expect(headline(m("a", null, "them"), "me", "Maya Chen")).toBe("Lost 3–5 vs Maya");
    // The viewer as opponent: scores flip to their side.
    expect(headline({ ...m("a", null), reporter_id: "them", opponent_id: "me", winner_id: "them" }, "me", "Maya")).toBe(
      "Lost 3–5 vs Maya"
    );
  });
});

describe("streakTier", () => {
  it("warms at 3, is hot at 5 and blazes at 10", () => {
    expect([0, 2, 3, 4, 5, 9, 10, 25].map(streakTier)).toEqual([
      "none", "none", "warm", "warm", "hot", "hot", "blaze", "blaze",
    ]);
  });
});

describe("dismissed list", () => {
  it("parses defensively and keeps the last twenty", () => {
    expect(dismissedIds(null)).toEqual([]);
    expect(dismissedIds("not json")).toEqual([]);
    expect(dismissedIds('["a","b"]')).toEqual(["a", "b"]);
    const many = JSON.stringify(Array.from({ length: 20 }, (_, i) => `m${i}`));
    const next = JSON.parse(withDismissed(many, "new")) as string[];
    expect(next).toHaveLength(20);
    expect(next[next.length - 1]).toBe("new");
    expect(next[0]).toBe("m1");
    expect(JSON.parse(withDismissed('["a"]', "a"))).toEqual(["a"]);
  });
});
