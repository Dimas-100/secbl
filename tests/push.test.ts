import { describe, expect, it } from "vitest";
import {
  eventPayload,
  isKnownPushEndpoint,
  matchConfirmedPayload,
  matchDisputedPayload,
  matchReportedPayload,
  messagePayload,
  promptDecision,
  recipientsFor,
  seasonClosedPayload,
  seasonOpenedPayload,
  seasonWeekLeftPayload,
  type Prefs,
} from "@/lib/push";

const c = (id: string, prefs: Prefs | null) => ({ profile_id: id, prefs });

describe("recipientsFor", () => {
  it("honours the category switch and treats missing prefs as on", () => {
    const list = [
      c("a", null),
      c("b", { messages: false, matches: true, events: true, league: true, social: true }),
      c("c", { messages: true, matches: false, events: true, league: true, social: true }),
    ];
    expect(recipientsFor(list, "messages", null)).toEqual(["a", "c"]);
    expect(recipientsFor(list, "matches", null)).toEqual(["a", "b"]);
    expect(recipientsFor(list, "events", null)).toEqual(["a", "b", "c"]);
  });
  it("treats missing prefs as the defaults: social off, everything else on", () => {
    const list = [c("a", null)];
    expect(recipientsFor(list, "social", null)).toEqual([]);
    expect(recipientsFor(list, "messages", null)).toEqual(["a"]);
    expect(recipientsFor(list, "league", null)).toEqual(["a"]);
    expect(recipientsFor([c("b", { messages: true, matches: true, events: true, league: true, social: true })], "social", null)).toEqual(["b"]);
  });
  it("honours the league switch", () => {
    const list = [c("a", null), c("b", { messages: true, matches: true, events: true, league: false, social: true })];
    expect(recipientsFor(list, "league", null)).toEqual(["a"]);
  });
  it("drops members who are no longer approved", () => {
    expect(recipientsFor([c("a", null), { profile_id: "s", prefs: null, approved: false }], "messages", null)).toEqual(["a"]);
  });
  it("never includes the actor, and dedupes", () => {
    expect(recipientsFor([c("a", null), c("me", null), c("a", null)], "events", "me")).toEqual(["a"]);
  });
});

describe("isKnownPushEndpoint", () => {
  it("accepts the browsers' push services and nothing else", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://jmt17.google.com/fcm/send/abc",
      "https://web.push.apple.com/QAbc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) {
      expect(isKnownPushEndpoint(ok)).toBe(true);
    }
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://evil.example/fcm/send/abc",
      "https://fcm.googleapis.com.evil.example/x",
      "https://169.254.169.254/latest",
      "not a url",
    ]) {
      expect(isKnownPushEndpoint(bad)).toBe(false);
    }
  });
});

describe("payloads", () => {
  it("names the sender for a room and not for a DM, and trims the body", () => {
    expect(
      messagePayload({
        channelId: "c1",
        channelType: "dm",
        roomName: "Direct message",
        senderName: "Sam Lee",
        body: "gg\n\nrematch?",
      })
    ).toMatchObject({ title: "Sam Lee", body: "gg rematch?", url: "/chat/c1", tag: "chat:c1", category: "messages" });
    expect(
      messagePayload({ channelId: "c2", channelType: "school", roomName: "GSU", senderName: "Sam Lee", body: "x".repeat(200) })
        .body
    ).toHaveLength(120);
    expect(
      messagePayload({ channelId: "c2", channelType: "school", roomName: "GSU", senderName: "Sam Lee", body: "hi" }).title
    ).toBe("GSU · Sam Lee");
  });
  it("describes a reported game with its format", () => {
    expect(
      matchReportedPayload({
        matchId: "m",
        reporterName: "Dennis Ho",
        reporterScore: 3,
        opponentScore: 1,
        gameLabel: "8-ball",
        format: "race to 3 · 1 spot",
      })
    ).toMatchObject({
      title: "Dennis Ho reported a game",
      body: "Dennis 3–1 you · 8-ball · race to 3 · 1 spot. Confirm?",
      url: "/",
      tag: "match:m",
      category: "matches",
    });
    expect(
      matchReportedPayload({ matchId: "m", reporterName: "Dennis Ho", reporterScore: 1, opponentScore: 3, gameLabel: "9-ball", format: null })
        .body
    ).toBe("Dennis 1–3 you · 9-ball. Confirm?");
  });
  it("describes a confirmation and a dispute", () => {
    expect(matchConfirmedPayload({ matchId: "m", opponentName: "Sam Lee", won: true, myScore: 3, theirScore: 1, delta: 12 })).toMatchObject({
      title: "Sam confirmed",
      body: "Won 3–1 · +12 rating",
      url: "/",
      tag: "match:m",
      category: "matches",
    });
    expect(matchConfirmedPayload({ matchId: "m", opponentName: "Sam Lee", won: false, myScore: 1, theirScore: 3, delta: -9 }).body).toBe(
      "Lost 1–3 · −9 rating"
    );
    expect(matchConfirmedPayload({ matchId: "m", opponentName: "Sam Lee", won: true, myScore: 3, theirScore: 1, delta: null }).body).toBe(
      "Won 3–1"
    );
    expect(matchDisputedPayload({ matchId: "m", opponentName: "Sam Lee" })).toMatchObject({
      title: "Sam disputed your report",
      body: "The admins will sort it out.",
      url: "/",
      category: "matches",
    });
  });
  it("describes an event", () => {
    expect(eventPayload({ eventId: "e", title: "League night", when: "Thu, Oct 8 · 7:00 PM", location: "Union" })).toMatchObject({
      title: "New event: League night",
      body: "Thu, Oct 8 · 7:00 PM · Union",
      url: "/events/e",
      tag: "event:e",
      category: "events",
    });
    expect(eventPayload({ eventId: "e", title: "League night", when: "Thu", location: null }).body).toBe("Thu");
  });
});

describe("promptDecision", () => {
  const base = { supported: true, permission: "default" as const, subscribed: false, snoozedUntil: null, now: 1_000_000, ios: false, standalone: false };
  it("offers Turn on to a supported browser that has not decided yet", () => {
    expect(promptDecision(base)).toBe("turn-on");
  });
  it("stays quiet once subscribed, blocked, or snoozed", () => {
    expect(promptDecision({ ...base, subscribed: true })).toBe("hide");
    expect(promptDecision({ ...base, permission: "denied" })).toBe("hide");
    expect(promptDecision({ ...base, snoozedUntil: 2_000_000 })).toBe("hide");
    expect(promptDecision({ ...base, snoozedUntil: 999_999 })).toBe("turn-on");
  });
  it("tells an iPhone in Safari to install first, and hides on other unsupported browsers", () => {
    expect(promptDecision({ ...base, supported: false, ios: true })).toBe("install");
    expect(promptDecision({ ...base, supported: true, ios: true, standalone: true })).toBe("turn-on");
    expect(promptDecision({ ...base, supported: false, ios: false })).toBe("hide");
  });
});

describe("season payloads", () => {
  it("opened, one week left, closed", () => {
    expect(seasonOpenedPayload({ seasonId: "s", name: "Fall 2026", endsOn: "2026-12-12" })).toEqual({
      title: "Fall 2026 has begun",
      body: "3 points a win, 1 a loss. Ends Dec 12.",
      url: "/leaderboard?tab=season",
      tag: "season:s",
      category: "league",
    });
    expect(seasonOpenedPayload({ seasonId: "s", name: "Fall 2026", endsOn: null }).body).toBe(
      "3 points a win, 1 a loss. No end date yet."
    );
    expect(seasonWeekLeftPayload({ seasonId: "s", name: "Fall 2026", leaderName: "Dennis Ro", leaderPoints: 42 }).body).toBe(
      "Dennis leads with 42 pts. Every game counts."
    );
    expect(seasonWeekLeftPayload({ seasonId: "s", name: "Fall 2026", leaderName: null, leaderPoints: 0 }).body).toBe(
      "Every game counts."
    );
    expect(seasonClosedPayload({ seasonId: "s", name: "Fall 2026", championName: "Dennis Ro", points: 48 })).toEqual({
      title: "Fall 2026 is in the books",
      body: "Dennis is champion with 48 pts.",
      url: "/leaderboard?tab=season&season=s",
      tag: "season:s",
      category: "league",
    });
    expect(seasonClosedPayload({ seasonId: "s", name: "Fall 2026", championName: null, points: 0 }).body).toBe(
      "No games were played."
    );
  });
});
