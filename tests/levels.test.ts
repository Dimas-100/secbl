import { describe, expect, it } from "vitest";
import { clubWeekOf } from "@/lib/events";
import {
  TITLES,
  XP_FINAL_BONUS,
  XP_LOSS,
  XP_WIN,
  levelFromXp,
  nextBadge,
  xpCaption,
  xpFromMatches,
  xpToNext,
  xpToReach,
  type XpMatch,
} from "@/lib/levels";

describe("ladder arithmetic", () => {
  it("costs 100 + 50·(n−1) to leave level n", () => {
    expect(xpToNext(1)).toBe(100);
    expect(xpToNext(2)).toBe(150);
    expect(xpToNext(12)).toBe(650);
  });
  it("xpToReach matches the summed per-level costs for L1–60", () => {
    let sum = 0;
    for (let L = 1; L <= 60; L++) {
      expect(xpToReach(L)).toBe(sum);
      sum += xpToNext(L);
    }
  });
  it("places the title thresholds where the spec says", () => {
    expect(xpToReach(5)).toBe(700);
    expect(xpToReach(10)).toBe(2700);
    expect(xpToReach(15)).toBe(5950);
    expect(xpToReach(25)).toBe(16200);
    expect(xpToReach(40)).toBe(40950);
  });
});

describe("levelFromXp", () => {
  it("maps XP to level boundaries", () => {
    expect(levelFromXp(0)).toMatchObject({ level: 1, title: "Rookie", intoLevel: 0, needed: 100 });
    expect(levelFromXp(699)).toMatchObject({ level: 4, title: "Rookie" });
    expect(levelFromXp(700)).toMatchObject({ level: 5, title: "Regular", intoLevel: 0, needed: 300 });
    expect(levelFromXp(40950)).toMatchObject({
      level: 40,
      title: "Legend",
      nextTitle: null,
      levelsToNextTitle: null,
    });
  });
  it("reports progress and the next title", () => {
    const l = levelFromXp(xpToReach(12) + 420);
    expect(l).toMatchObject({
      level: 12,
      title: "Shark",
      intoLevel: 420,
      needed: 650,
      nextTitle: "Hustler",
      levelsToNextTitle: 3,
    });
  });
  it("keeps climbing past Legend", () => {
    expect(levelFromXp(xpToReach(55)).level).toBe(55);
  });
  it("has six titles in order", () => {
    expect(TITLES.map((t) => t.name)).toEqual(["Rookie", "Regular", "Shark", "Hustler", "Master", "Legend"]);
  });
});

// Confirmed at a club-week instant: Wed Oct 7 2026 20:00 ET = 2026-10-08T00:00Z.
const WED = "2026-10-08T00:00:00Z";
const m = (
  id: string,
  a: string,
  b: string,
  winner: string,
  confirmed_at: string | null = WED,
  over: Partial<XpMatch> = {}
): XpMatch => ({
  id,
  reporter_id: a,
  opponent_id: b,
  winner_id: winner,
  status: "confirmed",
  confirmed_at,
  ...over,
});

describe("xpFromMatches", () => {
  it("pays 200 for a win and 80 for a loss", () => {
    const r = xpFromMatches("me", [m("1", "me", "x", "me"), m("2", "x", "me", "x")], clubWeekOf);
    expect(r.total).toBe(XP_WIN + XP_LOSS);
    expect(r.perMatch.get("1")).toBe(200);
    expect(r.perMatch.get("2")).toBe(80);
  });
  it("ignores pending, rejected and disputed matches, and matches without the viewer", () => {
    const r = xpFromMatches(
      "me",
      [
        m("1", "me", "x", "me", null, { status: "pending" }),
        m("2", "me", "x", "me", WED, { status: "rejected" }),
        m("3", "me", "x", "me", WED, { status: "disputed" }),
        m("4", "a", "b", "a"),
      ],
      clubWeekOf
    );
    expect(r.total).toBe(0);
    expect(r.perMatch.size).toBe(0);
  });
  it("caps a pair at three XP-earning matches per club week, for both players", () => {
    const week = [
      "2026-10-06T00:00:00Z",
      "2026-10-07T00:00:00Z",
      "2026-10-08T00:00:00Z",
      "2026-10-09T00:00:00Z",
      "2026-10-10T00:00:00Z",
    ];
    const list = week.map((at, i) => m(String(i + 1), "me", "x", i % 2 ? "x" : "me", at));
    list.push(m("other", "me", "y", "me", "2026-10-09T01:00:00Z"));
    const me = xpFromMatches("me", list, clubWeekOf);
    expect(me.perMatch.get("4")).toBe(0);
    expect(me.perMatch.get("5")).toBe(0);
    expect(me.capped.has("4")).toBe(true);
    expect(me.perMatch.get("other")).toBe(200);
    expect(me.total).toBe(200 + 80 + 200 + 0 + 0 + 200);
    const x = xpFromMatches("x", list, clubWeekOf);
    expect(x.perMatch.get("4")).toBe(0);
    expect(x.perMatch.get("5")).toBe(0);
  });
  it("resets the cap at Monday 00:00 New York time", () => {
    const list = [
      m("1", "me", "x", "me", "2026-10-10T00:00:00Z"),
      m("2", "me", "x", "me", "2026-10-11T00:00:00Z"),
      // Sunday Oct 11, 23:30 ET — still the same club week though UTC says Monday
      m("3", "me", "x", "me", "2026-10-12T03:30:00Z"),
      m("4", "me", "x", "me", "2026-10-12T03:45:00Z"),
      // Monday Oct 12, 00:00 ET — new week
      m("5", "me", "x", "me", "2026-10-12T04:00:00Z"),
    ];
    const r = xpFromMatches("me", list, clubWeekOf);
    expect(r.perMatch.get("3")).toBe(200);
    expect(r.perMatch.get("4")).toBe(0);
    expect(r.perMatch.get("5")).toBe(200);
  });
  it("resets correctly across the DST fall-back week", () => {
    const list = [
      m("1", "me", "x", "me", "2026-10-29T00:00:00Z"),
      m("2", "me", "x", "me", "2026-10-30T00:00:00Z"),
      m("3", "me", "x", "me", "2026-10-31T00:00:00Z"),
      // Sun Nov 1 23:30 EST = 04:30Z Mon — still the old week
      m("4", "me", "x", "me", "2026-11-02T04:30:00Z"),
      // Mon Nov 2 00:00 EST = 05:00Z — new week
      m("5", "me", "x", "me", "2026-11-02T05:00:00Z"),
    ];
    const r = xpFromMatches("me", list, clubWeekOf);
    expect(r.perMatch.get("4")).toBe(0);
    expect(r.perMatch.get("5")).toBe(200);
  });
  it("orders by confirmed_at, not input order, when deciding which three count", () => {
    const list = [
      m("late", "me", "x", "me", "2026-10-09T00:00:00Z"),
      m("a", "me", "x", "me", "2026-10-06T00:00:00Z"),
      m("b", "me", "x", "me", "2026-10-07T00:00:00Z"),
      m("c", "me", "x", "me", "2026-10-08T00:00:00Z"),
    ];
    const r = xpFromMatches("me", list, clubWeekOf);
    expect(r.perMatch.get("late")).toBe(0);
    expect(r.perMatch.get("c")).toBe(200);
  });
  it("adds the tournament final bonus once", () => {
    const r = xpFromMatches(
      "me",
      [m("f", "me", "x", "me", WED, { is_final: true }), m("f", "me", "x", "me", WED, { is_final: true })],
      clubWeekOf
    );
    expect(r.perMatch.get("f")).toBe(XP_WIN + XP_FINAL_BONUS);
    expect(r.total).toBe(XP_WIN + XP_FINAL_BONUS);
  });
  it("gives the loser of a final no bonus", () => {
    const r = xpFromMatches("me", [m("f", "me", "x", "x", WED, { is_final: true })], clubWeekOf);
    expect(r.perMatch.get("f")).toBe(XP_LOSS);
  });
});

describe("xpCaption", () => {
  it("labels earned, capped and foreign rows", () => {
    const r = xpFromMatches(
      "me",
      [m("1", "me", "x", "me"), m("2", "me", "x", "x"), m("3", "me", "x", "me"), m("4", "me", "x", "me")],
      clubWeekOf
    );
    expect(xpCaption("1", r)).toBe("+200 XP");
    expect(xpCaption("2", r)).toBe("+80 XP");
    expect(xpCaption("4", r)).toBe("No XP — weekly limit");
    expect(xpCaption("nope", r)).toBeNull();
  });
});

describe("nextBadge", () => {
  it("points at the next title and the XP to reach it", () => {
    const xp = xpToReach(12) + 420;
    expect(nextBadge(levelFromXp(xp), xp)).toEqual({ title: "Hustler", atLevel: 15, xpToGo: xpToReach(15) - xp });
    expect(nextBadge(levelFromXp(0), 0)).toEqual({ title: "Regular", atLevel: 5, xpToGo: 700 });
    expect(nextBadge(levelFromXp(xpToReach(41)), xpToReach(41))).toBeNull();
  });
});
