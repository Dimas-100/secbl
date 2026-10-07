import { describe, expect, it } from "vitest";
import { describeActivity, feedStamp, one, type FeedRow } from "@/lib/feed";

const p = (id: string, name: string, school = "GSU") => ({
  id,
  display_name: name,
  avatar_url: null,
  ball: null,
  schools: { short_name: school },
});
const base = {
  id: "x",
  match_id: null,
  tournament_id: null,
  season_id: null,
  other_id: null,
  match: null,
  created_at: "2026-10-06T15:00:00Z",
};
const row = (over: Partial<FeedRow>): FeedRow =>
  ({ ...base, kind: "badge", actor_id: "a", actor: p("a", "Maya Chen"), other: null, data: {}, ...over }) as FeedRow;

describe("one", () => {
  it("unwraps PostgREST's one-or-array join shape", () => {
    expect(one(null)).toBeNull();
    expect(one([])).toBeNull();
    expect(one([{ a: 1 }])).toEqual({ a: 1 });
    expect(one({ a: 2 })).toEqual({ a: 2 });
  });
});

describe("feedStamp", () => {
  const now = new Date("2026-10-06T15:30:00Z");
  it("reads just now, minutes, hours, yesterday, then a date", () => {
    expect(feedStamp("2026-10-06T15:29:40Z", now)).toBe("Just now");
    expect(feedStamp("2026-10-06T15:10:00Z", now)).toBe("20m");
    expect(feedStamp("2026-10-06T12:00:00Z", now)).toBe("3h");
    expect(feedStamp("2026-10-05T12:00:00Z", now)).toBe("Yesterday");
    expect(feedStamp("2026-10-01T12:00:00Z", now)).toBe("Oct 1");
  });
});

describe("describeActivity", () => {
  it("badge", () => {
    const d = describeActivity(row({ data: { title: "Shark", level: 10 } }), "z");
    expect(d.title).toBe("Maya is now a Shark");
    expect(d.meta).toBe("Level 10 · badge unlocked");
    expect(d.href).toBe("/players/a");
    expect(describeActivity(row({ data: { title: "Shark", level: 10 } }), "a").title).toBe("You are now a Shark");
  });
  it("streak and pass use first names and You", () => {
    expect(describeActivity(row({ kind: "streak", data: { length: 5 } }), "z").title).toBe("Maya is on a 5-game win streak");
    expect(describeActivity(row({ kind: "streak", data: { length: 5 } }), "a").title).toBe("You're on a 5-game win streak");
    const pass = row({ kind: "pass", other_id: "b", other: p("b", "Dennis Ro"), data: { rank: 4 } });
    expect(describeActivity(pass, "z").title).toBe("Maya passed Dennis for #4");
    expect(describeActivity(pass, "b").title).toBe("Maya passed you for #4");
    expect(describeActivity(pass, "a").title).toBe("You passed Dennis for #4");
    expect(describeActivity(pass, "z").href).toBe("/leaderboard?tab=players");
  });
  it("cups", () => {
    expect(
      describeActivity(row({ kind: "cup_started", actor: null, tournament_id: "t", data: { name: "Fall Cup", players: 8, race_to: 5 } }), "z")
    ).toEqual({ title: "Fall Cup is under way", meta: "8 players · race to 5", href: "/tournaments/t" });
    expect(
      describeActivity(row({ kind: "cup_round", actor: null, tournament_id: "t", data: { name: "Fall Cup", round: 2, rounds: 3 } }), "z").title
    ).toBe("Fall Cup · Semifinals complete");
    expect(describeActivity(row({ kind: "cup_won", tournament_id: "t", data: { name: "Fall Cup" } }), "z")).toEqual({
      title: "Maya won the Fall Cup",
      meta: "Champion",
      href: "/tournaments/t",
    });
  });
  it("seasons and joins", () => {
    expect(
      describeActivity(row({ kind: "season_opened", actor: null, season_id: "s", data: { name: "Fall 2026", ends_on: "2026-12-12" } }), "z")
    ).toEqual({ title: "Fall 2026 has begun", meta: "3 pts a win, 1 a loss · ends Dec 12", href: "/leaderboard?tab=season" });
    expect(
      describeActivity(row({ kind: "season_opened", actor: null, season_id: "s", data: { name: "Fall 2026", ends_on: null } }), "z").meta
    ).toBe("3 pts a win, 1 a loss");
    expect(
      describeActivity(
        row({ kind: "season_week_left", actor: null, season_id: "s", data: { name: "Fall 2026", leader_name: "Dennis Ro", leader_points: 42 } }),
        "z"
      )
    ).toEqual({ title: "One week left in Fall 2026", meta: "Dennis leads with 42 pts", href: "/leaderboard?tab=season" });
    expect(describeActivity(row({ kind: "season_closed", season_id: "s", data: { name: "Fall 2026", points: 48 } }), "z")).toEqual({
      title: "Maya is the Fall 2026 champion",
      meta: "48 pts · season closed",
      href: "/leaderboard?tab=season&season=s",
    });
    expect(describeActivity(row({ kind: "member_joined" }), "z")).toEqual({ title: "Maya joined from GSU", meta: null, href: "/players/a" });
    expect(describeActivity(row({ kind: "member_joined" }), "a").title).toBe("You joined from GSU");
  });
});
