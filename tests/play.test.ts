import { describe, expect, it } from "vitest";
import { PLAY_FACES, playFaces, resumableDraft, resumeLine } from "@/lib/play";
import { DRAFT_MAX_AGE_MS, draftKey } from "@/lib/report-form";

const now = Date.parse("2026-10-21T20:00:00Z");

describe("draft constants", () => {
  it("keeps the scoreboard's 12-hour window and per-member key", () => {
    expect(DRAFT_MAX_AGE_MS).toBe(12 * 60 * 60 * 1000);
    expect(draftKey("me1")).toBe("secbl:draft-game:me1");
  });
});

describe("resumableDraft", () => {
  it("is null for nothing or unreadable storage", () => {
    expect(resumableDraft(null, now)).toBeNull();
    expect(resumableDraft("{oops", now)).toBeNull();
  });

  it("is null when no opponent is picked", () => {
    const raw = JSON.stringify({ at: now - 60_000, opponentId: null, you: 3, them: 2 });
    expect(resumableDraft(raw, now)).toBeNull();
  });

  it("is null once the draft is older than 12 hours", () => {
    const raw = JSON.stringify({ at: now - 13 * 3600_000, opponentId: "a", you: 3, them: 2 });
    expect(resumableDraft(raw, now)).toBeNull();
  });

  it("returns just the opponent and the score for a fresh draft", () => {
    const raw = JSON.stringify({ at: now - 60_000, opponentId: "a", you: 3, them: 2, game: "8ball" });
    expect(resumableDraft(raw, now)).toEqual({ opponentId: "a", you: 3, them: 2 });
  });

  it("reads a non-numeric score as 0", () => {
    const raw = JSON.stringify({ at: now - 60_000, opponentId: "a", you: "x", them: 2 });
    expect(resumableDraft(raw, now)).toEqual({ opponentId: "a", you: 0, them: 2 });
  });
});

describe("resumeLine", () => {
  it("shows the score with an en dash and the opponent's first name", () => {
    expect(resumeLine({ opponentId: "a", you: 3, them: 2 }, "Jordan Lee")).toBe("3–2 vs Jordan");
  });
});

describe("playFaces", () => {
  const members = [
    { id: "a", school_id: "s1", display_name: "Ana" },
    { id: "b", school_id: "s1", display_name: "Ben" },
    { id: "c", school_id: "s2", display_name: "Cal" },
    { id: "d", school_id: "s2", display_name: "Dee" },
  ];

  it("puts recent opponents first (deduped), then same school, then the rest", () => {
    expect(playFaces(["c", "a", "c"], members, "s1")).toEqual(["c", "a", "b", "d"]);
  });

  it("drops ids that are not members", () => {
    expect(playFaces(["gone"], members, "s1")).toEqual(["a", "b", "c", "d"]);
  });

  it("handles an empty roster and caps at n", () => {
    expect(playFaces([], [], "s1")).toEqual([]);
    expect(playFaces([], members, "s1", 2)).toHaveLength(2);
    expect(PLAY_FACES).toBe(4);
  });
});
