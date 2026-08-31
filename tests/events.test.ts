import { describe, expect, it } from "vitest";
import {
  CLUB_TIMEZONE,
  clubTimeToISO,
  formatEventWhen,
  isoToClubTime,
  partitionEvents,
  tallyRsvps,
} from "@/lib/events";

describe("CLUB_TIMEZONE", () => {
  it("is the club's zone, not the server's", () => {
    expect(CLUB_TIMEZONE).toBe("America/New_York");
  });
});

describe("formatEventWhen", () => {
  it("renders a UTC instant as club-local evening time", () => {
    // 2026-09-05T23:00Z is 7:00 PM EDT on Saturday Sep 5.
    expect(formatEventWhen("2026-09-05T23:00:00Z", null)).toBe("Sat, Sep 5 · 7:00 PM");
  });

  it("honors standard time in winter", () => {
    // 2026-01-15T00:00Z is 7:00 PM EST on Wednesday Jan 14.
    expect(formatEventWhen("2026-01-15T00:00:00Z", null)).toBe("Wed, Jan 14 · 7:00 PM");
  });

  it("collapses a same-day range to one date with a time range", () => {
    expect(formatEventWhen("2026-09-05T23:00:00Z", "2026-09-06T02:00:00Z")).toBe(
      "Sat, Sep 5 · 7:00 PM – 10:00 PM"
    );
  });

  it("spells out both sides when the range crosses club midnight", () => {
    expect(formatEventWhen("2026-09-05T23:00:00Z", "2026-09-06T05:00:00Z")).toBe(
      "Sat, Sep 5, 7:00 PM – Sun, Sep 6, 1:00 AM"
    );
  });
});

describe("clubTimeToISO / isoToClubTime", () => {
  it("reads a datetime-local value as club wall-clock time (daylight time)", () => {
    // Mar 8 2026 is after the spring-forward, so club time is UTC-4.
    expect(clubTimeToISO("2026-03-08T19:00")).toBe("2026-03-08T23:00:00.000Z");
  });

  it("reads a datetime-local value as club wall-clock time (standard time)", () => {
    // Nov 1 2026 is after the fall-back, so club time is UTC-5.
    expect(clubTimeToISO("2026-11-01T19:00")).toBe("2026-11-02T00:00:00.000Z");
  });

  it("round-trips back to the same wall-clock string", () => {
    expect(isoToClubTime(clubTimeToISO("2026-09-05T19:00"))).toBe("2026-09-05T19:00");
    expect(isoToClubTime(clubTimeToISO("2026-01-14T19:00"))).toBe("2026-01-14T19:00");
  });

  it("formats an instant back into a datetime-local value", () => {
    expect(isoToClubTime("2026-09-05T23:00:00Z")).toBe("2026-09-05T19:00");
  });
});

describe("partitionEvents", () => {
  const now = new Date("2026-09-05T12:00:00Z");
  const events = [
    { id: "later", starts_at: "2026-09-20T23:00:00Z", ends_at: null },
    { id: "over", starts_at: "2026-08-01T23:00:00Z", ends_at: null },
    { id: "soon", starts_at: "2026-09-06T23:00:00Z", ends_at: null },
    { id: "older", starts_at: "2026-07-01T23:00:00Z", ends_at: null },
  ];

  it("sorts upcoming soonest-first and past most-recent-first", () => {
    const { upcoming, past } = partitionEvents(events, now);
    expect(upcoming.map((e) => e.id)).toEqual(["soon", "later"]);
    expect(past.map((e) => e.id)).toEqual(["over", "older"]);
  });

  it("keeps an in-progress event in upcoming until its end time", () => {
    const inProgress = [
      { id: "running", starts_at: "2026-09-05T10:00:00Z", ends_at: "2026-09-05T14:00:00Z" },
    ];
    expect(partitionEvents(inProgress, now).upcoming.map((e) => e.id)).toEqual(["running"]);
  });

  it("treats a start-only event as past once its start has passed", () => {
    const started = [{ id: "started", starts_at: "2026-09-05T10:00:00Z", ends_at: null }];
    expect(partitionEvents(started, now).past.map((e) => e.id)).toEqual(["started"]);
  });
});

describe("tallyRsvps", () => {
  const rsvps = [
    { profile_id: "a", response: "going" as const },
    { profile_id: "b", response: "going" as const },
    { profile_id: "c", response: "maybe" as const },
    { profile_id: "d", response: "no" as const },
  ];

  it("counts each response", () => {
    const tally = tallyRsvps(rsvps, "zzz");
    expect(tally.going).toBe(2);
    expect(tally.maybe).toBe(1);
    expect(tally.no).toBe(1);
  });

  it("reports the viewer's own answer", () => {
    expect(tallyRsvps(rsvps, "c").mine).toBe("maybe");
  });

  it("reports null when the viewer has not answered", () => {
    expect(tallyRsvps(rsvps, "zzz").mine).toBeNull();
  });

  it("handles an event with no RSVPs", () => {
    expect(tallyRsvps([], "a")).toEqual({ going: 0, maybe: 0, no: 0, mine: null });
  });
});
