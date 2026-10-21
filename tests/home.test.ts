import { describe, expect, it } from "vitest";
import {
  PLACEMENT_GAMES,
  confirmMeta,
  facesEyebrow,
  firstName,
  formDots,
  nextLine,
  placementLeft,
  playedFrom,
  xpNote,
} from "@/lib/home";
import { levelFromXp, xpToReach } from "@/lib/levels";

const placed = { played: 15, above: null, lead: null, badge: null };

describe("placement", () => {
  it("is ten games", () => {
    expect(PLACEMENT_GAMES).toBe(10);
  });

  it("counts the games still to play, never below zero", () => {
    expect(placementLeft(0)).toBe(10);
    expect(placementLeft(7)).toBe(3);
    expect(placementLeft(10)).toBe(0);
    expect(placementLeft(12)).toBe(0);
  });
});

describe("formDots", () => {
  const W = { winner_id: "me" };
  const L = { winner_id: "them" };

  it("reads the newest-first list oldest to newest", () => {
    expect(formDots([W, L, L], "me")).toEqual(["L", "L", "W"]);
  });

  it("keeps only the newest five", () => {
    // Newest first: W L W W L, then an older W that falls off.
    expect(formDots([W, L, W, W, L, W], "me")).toEqual(["L", "W", "W", "L", "W"]);
  });

  it("takes another count when asked, and nothing from no games", () => {
    expect(formDots([W, L, W, W], "me", 2)).toEqual(["L", "W"]);
    expect(formDots([], "me")).toEqual([]);
  });
});

describe("nextLine", () => {
  const above = { name: "Jordan Avery", rank: 2, gap: 18 };
  const lead = { name: "Riley Stone", gap: 20 };
  const badge = { title: "Regular", xpToGo: 140 };

  it("counts down placement first, whatever else applies", () => {
    expect(nextLine({ played: 7, above, lead: null, badge })).toBe("3 more games to finish placement");
    expect(nextLine({ played: 9, above: null, lead: null, badge: null })).toBe("1 more game to finish placement");
  });

  it("names the member directly above, by first name", () => {
    expect(nextLine({ ...placed, above, badge })).toBe("Next: pass Jordan for #2 · 18 pts");
  });

  it("says one point in the singular", () => {
    expect(nextLine({ ...placed, above: { ...above, gap: 1 } })).toBe("Next: pass Jordan for #2 · 1 pt");
    expect(nextLine({ ...placed, lead: { ...lead, gap: 1 } })).toBe("You're #1 · 1 pt ahead of Riley");
  });

  it("says level on rating when nothing separates you", () => {
    expect(nextLine({ ...placed, above: { ...above, gap: 0 } })).toBe("Next: pass Jordan for #2 · level on rating");
  });

  it("gives #1 the lead over #2", () => {
    expect(nextLine({ ...placed, lead, badge })).toBe("You're #1 · 20 pts ahead of Riley");
  });

  it("says level on rating with #2 when #1 leads by nothing", () => {
    expect(nextLine({ ...placed, lead: { ...lead, gap: 0 } })).toBe("You're #1 · level on rating with Riley");
  });

  it("falls back to the next badge", () => {
    expect(nextLine({ ...placed, badge })).toBe("Next: Regular badge · 140 XP");
  });

  it("writes thousands with a comma, as the profile does", () => {
    expect(nextLine({ ...placed, badge: { title: "Master", xpToGo: 3450 } })).toBe("Next: Master badge · 3,450 XP");
  });

  it("is null when nothing applies", () => {
    expect(nextLine(placed)).toBeNull();
  });
});

describe("facesEyebrow", () => {
  const mine = "school-a";
  const other = "school-b";

  it("names the school only when every face is a schoolmate", () => {
    expect(facesEyebrow([mine, mine, mine, mine], mine, "GSU")).toBe("Play someone from GSU");
  });

  it("does not name the school when some faces come from elsewhere", () => {
    expect(facesEyebrow([mine, mine, other, other], mine, "GSU")).toBe("Play someone now");
  });

  it("does not name the school when no face is a schoolmate", () => {
    expect(facesEyebrow([other, other, null], mine, "GSU")).toBe("Play someone now");
  });

  it("does not name a school it doesn't know, or one with nobody to show", () => {
    expect(facesEyebrow([mine, mine], mine, null)).toBe("Play someone now");
    expect(facesEyebrow([null, null], null, "GSU")).toBe("Play someone now");
    expect(facesEyebrow([], mine, "GSU")).toBe("Play someone now");
  });
});

describe("xpNote", () => {
  it("counts the XP to the next title", () => {
    // 560 XP: level 4, 110 XP into it, 140 short of level 5 (Regular).
    const level = levelFromXp(560);
    expect(level).toMatchObject({ level: 4, title: "Rookie", intoLevel: 110 });
    expect(xpNote(level, 560)).toBe("140 XP to Regular");
  });

  it("counts to the title, not the next level", () => {
    // 4,500 XP: a level-13 Shark; Hustler comes at level 15.
    const level = levelFromXp(4500);
    expect(level).toMatchObject({ level: 13, title: "Shark" });
    expect(xpNote(level, 4500)).toBe("1,450 XP to Hustler");
  });

  it("shows a Legend the XP into the level, with thousands separators", () => {
    // Level 40 needs 2,050 XP to level 41.
    const total = xpToReach(40) + 1200;
    const level = levelFromXp(total);
    expect(level.title).toBe("Legend");
    expect(xpNote(level, total)).toBe("1,200 / 2,050 XP");
    expect(xpNote(levelFromXp(xpToReach(40) + 300), xpToReach(40) + 300)).toBe("300 / 2,050 XP");
  });
});

describe("confirmMeta", () => {
  const game = {
    reporterName: "Jordan Lee",
    reporterWon: true,
    reporterScore: 5,
    opponentScore: 3,
    gameType: "8ball",
    raceTo: 5,
    spot: 0,
    spotToMe: false,
  };

  it("names the reporter by first name when they won", () => {
    expect(confirmMeta(game)).toBe("Jordan won 5–3 · 8-ball · Race to 5");
  });

  it("reads You when the confirmer won, high score first", () => {
    expect(confirmMeta({ ...game, reporterWon: false, reporterScore: 2, opponentScore: 5 })).toBe(
      "You won 5–2 · 8-ball · Race to 5"
    );
  });

  it("says who got the spot", () => {
    expect(confirmMeta({ ...game, raceTo: 3, spot: 1, spotToMe: true, reporterScore: 3, opponentScore: 1 })).toBe(
      "Jordan won 3–1 · 8-ball · Race to 3 · 1 on the wire to you"
    );
    expect(confirmMeta({ ...game, spot: 2, spotToMe: false })).toBe(
      "Jordan won 5–3 · 8-ball · Race to 5 · 2 on the wire to Jordan"
    );
  });

  it("leaves the format out for open play and keeps an unknown game as is", () => {
    expect(confirmMeta({ ...game, raceTo: null, gameType: "straight" })).toBe("Jordan won 5–3 · straight");
  });
});

describe("playedFrom", () => {
  it("counts games from the member's leaderboard row, and rank is known", () => {
    expect(playedFrom({ wins: 7, losses: 5 }, 3)).toEqual({ played: 12, rankKnown: true });
    expect(playedFrom({ wins: 0, losses: 0 }, 0)).toEqual({ played: 0, rankKnown: true });
  });

  it("falls back to the profile's count when the row is missing, so a veteran never reads as new", () => {
    expect(playedFrom(undefined, 24)).toEqual({ played: 24, rankKnown: false });
  });

  it("is zero with neither", () => {
    expect(playedFrom(undefined, null)).toEqual({ played: 0, rankKnown: false });
    expect(playedFrom(undefined, undefined)).toEqual({ played: 0, rankKnown: false });
  });
});

describe("firstName", () => {
  it("is the first word of the display name", () => {
    expect(firstName("Jordan Lee")).toBe("Jordan");
    expect(firstName("  Sam  ")).toBe("Sam");
  });
});
