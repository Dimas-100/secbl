import { describe, expect, it } from "vitest";
import { LIVE_SHOWN, LIVE_STALE_MS, isFresh, liveLine, orderLiveGames, recentlySent, validateLive, type LiveInput } from "@/lib/live";

const ok: LiveInput = { opponentId: "b", gameType: "9ball", raceTo: 5, spot: 0, spotTo: null, you: 3, them: 2 };

describe("validateLive", () => {
  it("accepts a race and open play", () => {
    expect(validateLive(ok, "a")).toBeNull();
    expect(validateLive({ ...ok, raceTo: null }, "a")).toBeNull();
    expect(validateLive({ ...ok, spot: 2, spotTo: "them" }, "a")).toBeNull();
  });
  it("rejects yourself, nobody, a spot that does not fit, and bad scores", () => {
    expect(validateLive({ ...ok, opponentId: "a" }, "a")).toBe("Pick an opponent");
    expect(validateLive({ ...ok, opponentId: "" }, "a")).toBe("Pick an opponent");
    expect(validateLive({ ...ok, spot: 5, spotTo: "them" }, "a")).toBe("That spot doesn't fit the race");
    expect(validateLive({ ...ok, raceTo: null, spot: 1, spotTo: "them" }, "a")).toBe("That spot doesn't fit the race");
    expect(validateLive({ ...ok, spot: 1, spotTo: null }, "a")).toBe("That spot doesn't fit the race");
    expect(validateLive({ ...ok, raceTo: 40 }, "a")).toBe("Pick a race length");
    expect(validateLive({ ...ok, you: -1 }, "a")).toBe("Bad score");
    expect(validateLive({ ...ok, them: 1.5 }, "a")).toBe("Bad score");
  });
  it("only knows the four game types", () => {
    for (const g of ["8ball", "9ball", "10ball", "other"]) expect(validateLive({ ...ok, gameType: g }, "a")).toBeNull();
    expect(validateLive({ ...ok, gameType: "<b>hi</b>" }, "a")).toBe("Pick a game");
    expect(validateLive({ ...ok, gameType: "" }, "a")).toBe("Pick a game");
  });
});

describe("liveLine", () => {
  it("fills the rails and says what the leader needs", () => {
    expect(liveLine({ reporter_score: 3, opponent_score: 2, race_to: 5 })).toEqual({
      reporter: 0.6,
      opponent: 0.4,
      need: "First to 5 · leader needs 2",
    });
    expect(liveLine({ reporter_score: 5, opponent_score: 2, race_to: 5 }).need).toBe("Finished");
    expect(liveLine({ reporter_score: 3, opponent_score: 2, race_to: null })).toEqual({ reporter: 0, opponent: 0, need: null });
  });
});

describe("recentlySent", () => {
  it("treats a report sent in the last minute as the end of the live table", () => {
    const now = new Date("2026-10-06T20:00:00Z");
    expect(recentlySent(null, now)).toBe(false);
    expect(recentlySent("2026-10-06T19:59:30Z", now)).toBe(true);
    expect(recentlySent("2026-10-06T19:58:00Z", now)).toBe(false);
  });
});

describe("isFresh", () => {
  it("forgets a table after three hours", () => {
    const now = new Date("2026-10-06T20:00:00Z");
    expect(LIVE_STALE_MS).toBe(3 * 3_600_000);
    expect(isFresh("2026-10-06T17:01:00Z", now)).toBe(true);
    expect(isFresh("2026-10-06T16:59:00Z", now)).toBe(false);
  });
});

describe("orderLiveGames", () => {
  const g = (reporter: string, opponent: string, schools: [string, string], updated: string) => ({
    reporter_id: reporter,
    opponent_id: opponent,
    reporter_school: schools[0],
    opponent_school: schools[1],
    updated_at: updated,
  });
  it("puts your table first, then tables you are playing at, then your school's, newest first within each", () => {
    const rows = [
      g("x", "y", ["GT", "GT"], "2026-10-07T20:05:00Z"),
      g("p", "q", ["UGA", "GT"], "2026-10-07T20:04:00Z"),
      g("r", "me", ["GT", "UGA"], "2026-10-07T20:01:00Z"),
      g("me", "s", ["UGA", "GT"], "2026-10-07T19:50:00Z"),
      g("t", "u", ["UGA", "UGA"], "2026-10-07T20:06:00Z"),
    ];
    expect(orderLiveGames(rows, { meId: "me", mySchool: "UGA" }).map((r) => r.reporter_id)).toEqual(["me", "r", "t", "p", "x"]);
  });
  it("shows three before the fold", () => {
    expect(LIVE_SHOWN).toBe(3);
  });
});
