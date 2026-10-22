import { describe, expect, it } from "vitest";
import { RECENT_KINDS, describeActivity, eventRecap, feedStamp, mergeRecent, nightRecap, one, type FeedRow } from "@/lib/feed";

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

describe("RECENT_KINDS", () => {
  it("keeps results, seasons and cups, and leaves out the one-person moments", () => {
    expect([...RECENT_KINDS].sort()).toEqual(
      ["cup_started", "cup_won", "match", "season_closed", "season_opened", "season_week_left"].sort()
    );
    for (const k of ["badge", "streak", "pass", "member_joined", "cup_round"]) {
      expect(RECENT_KINDS as readonly string[]).not.toContain(k);
    }
  });
});

describe("eventRecap", () => {
  const ev = { id: "e1", title: "Fall Social", starts_at: "2026-10-10T22:00:00Z", ends_at: "2026-10-11T01:00:00Z" };
  it("tells an event after it ends, with who said they were going", () => {
    const rsvps = [{ response: "going" }, { response: "maybe" }, { response: "going" }, { response: "no" }];
    expect(eventRecap({ ...ev, rsvps })).toEqual({
      key: "event:e1",
      at: "2026-10-11T01:00:00Z",
      kind: "event",
      title: "Fall Social",
      meta: "Event · 2 going",
      href: "/events/e1",
    });
  });
  it("is just an event with nobody going, and ends when it starts with no end time", () => {
    const r = eventRecap({ ...ev, ends_at: null, rsvps: [] });
    expect(r.meta).toBe("Event");
    expect(r.at).toBe("2026-10-10T22:00:00Z");
  });
});

describe("nightRecap", () => {
  const night = {
    id: "n1",
    school_id: "gsu",
    opened_at: "2026-10-16T22:00:00Z",
    closed_at: "2026-10-17T02:00:00Z",
    schools: { short_name: "GSU" },
  };
  const g = (a: string, b: string, at: string, sa = "gsu", sb = "gsu") => ({
    reporter_id: a,
    opponent_id: b,
    created_at: at,
    reporter_school: sa,
    opponent_school: sb,
  });
  it("counts the night's games between its school's members, and the players in them", () => {
    const games = [
      g("a", "b", "2026-10-16T22:30:00Z"),
      g("c", "d", "2026-10-16T23:10:00Z"),
      g("a", "c", "2026-10-17T01:00:00Z"),
      g("a", "b", "2026-10-16T21:59:00Z"), // before it opened
      g("a", "b", "2026-10-17T02:01:00Z"), // after it closed
      g("a", "x", "2026-10-16T23:00:00Z", "gsu", "ksu"), // someone from another school
    ];
    expect(nightRecap(night, games)).toEqual({
      key: "night:n1",
      at: "2026-10-17T02:00:00Z",
      kind: "night",
      title: "GSU club night",
      meta: "3 games · 4 players",
      href: "/night",
    });
  });
  it("says one game in the singular", () => {
    expect(nightRecap(night, [g("a", "b", "2026-10-16T22:30:00Z")])?.meta).toBe("1 game · 2 players");
  });
  it("is nothing for a night with no games", () => {
    expect(nightRecap(night, [])).toBeNull();
    expect(nightRecap(night, [g("a", "b", "2026-10-15T22:30:00Z")])).toBeNull();
  });
  it("reads plain Club night without a school name", () => {
    expect(nightRecap({ ...night, schools: null }, [g("a", "b", "2026-10-16T22:30:00Z")])?.title).toBe("Club night");
  });
});

describe("mergeRecent", () => {
  const r = (id: string, at: string) => row({ id, kind: "match", created_at: at });
  const recap = (key: string, at: string) => ({ key, at, kind: "event" as const, title: key, meta: "Event", href: "/events/x" });
  it("puts recaps among the feed rows by time, newest first", () => {
    const merged = mergeRecent(
      [r("m1", "2026-10-20T12:00:00Z"), r("m2", "2026-10-18T12:00:00Z")],
      [recap("e", "2026-10-19T12:00:00Z"), recap("f", "2026-10-21T12:00:00Z")],
      30
    );
    expect(merged.map((i) => (i.type === "row" ? i.row.id : i.recap.key))).toEqual(["f", "m1", "e", "m2"]);
  });
  it("drops a recap older than the oldest row when the feed was cut at its limit", () => {
    const rows = [r("m1", "2026-10-20T12:00:00Z"), r("m2", "2026-10-18T12:00:00Z")];
    const old = recap("old", "2026-10-10T12:00:00Z");
    expect(mergeRecent(rows, [old], 2).map((i) => i.type)).toEqual(["row", "row"]);
    // Not cut: everything older is already here, so the recap belongs at the end.
    expect(mergeRecent(rows, [old], 30).map((i) => i.type)).toEqual(["row", "row", "recap"]);
  });
  it("shows recaps alone when there are no rows", () => {
    expect(mergeRecent([], [recap("e", "2026-10-19T12:00:00Z")], 30)).toHaveLength(1);
  });
});
