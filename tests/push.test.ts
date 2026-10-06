import { describe, expect, it } from "vitest";
import {
  eventPayload,
  matchConfirmedPayload,
  matchDisputedPayload,
  matchReportedPayload,
  messagePayload,
  recipientsFor,
  type Prefs,
} from "@/lib/push";

const c = (id: string, prefs: Prefs | null) => ({ profile_id: id, prefs });

describe("recipientsFor", () => {
  it("honours the category switch and treats missing prefs as on", () => {
    const list = [
      c("a", null),
      c("b", { messages: false, matches: true, events: true }),
      c("c", { messages: true, matches: false, events: true }),
    ];
    expect(recipientsFor(list, "messages", null)).toEqual(["a", "c"]);
    expect(recipientsFor(list, "matches", null)).toEqual(["a", "b"]);
    expect(recipientsFor(list, "events", null)).toEqual(["a", "b", "c"]);
  });
  it("never includes the actor, and dedupes", () => {
    expect(recipientsFor([c("a", null), c("me", null), c("a", null)], "events", "me")).toEqual(["a"]);
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
