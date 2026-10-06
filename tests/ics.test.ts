import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseIcs, parseIcsDate, unescapeText, unfoldLines } from "@/lib/ics";

const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "pin-sample.ics"), "utf8");

describe("parseIcs on a real PIN feed", () => {
  const events = parseIcs(fixture);

  it("reads every VEVENT with Engage's UTC times and URL uids", () => {
    expect(events).toHaveLength(3);
    const first = events[0];
    expect(first.uid).toBe("https://pin.gsu.edu/event/12698357");
    expect(first.summary).toBe("Get Fair Ready");
    expect(first.startsAt).toBe("2026-10-06T15:00:00.000Z");
    expect(first.endsAt).toBe("2026-10-06T16:00:00.000Z");
    expect(first.location).toBe("25 Park Place, Room 2608");
    expect(first.url).toBe("https://pin.gsu.edu/event/12698357");
    expect(first.allDay).toBe(false);
    expect(first.cancelled).toBe(false);
  });

  it("unfolds and unescapes the long description", () => {
    const first = events[0];
    expect(first.description).toContain("Get Fair Ready Game Day turns career preparation into a fast-paced, interactive competition");
    expect(first.description).not.toContain("\\,");
  });
});

describe("unfoldLines", () => {
  it("joins continuation lines and tolerates CRLF", () => {
    expect(unfoldLines("A:one\r\n two\r\nB:x\n\tyz\n")).toEqual(["A:onetwo", "B:xyz"]);
  });
});

describe("unescapeText", () => {
  it("handles commas, semicolons, newlines and backslashes", () => {
    expect(unescapeText("a\\, b\\; c\\nd \\\\ e")).toBe("a, b; c\nd \\ e");
  });
});

describe("parseIcsDate", () => {
  it("reads UTC instants", () => {
    expect(parseIcsDate("20261006T150000Z", {})).toEqual({ iso: "2026-10-06T15:00:00.000Z", allDay: false });
  });
  it("reads TZID and floating times on the club clock", () => {
    // 7pm Eastern in October is 23:00Z.
    expect(parseIcsDate("20261006T190000", { TZID: "America/New_York" })?.iso).toBe("2026-10-06T23:00:00.000Z");
    expect(parseIcsDate("20261006T190000", {})?.iso).toBe("2026-10-06T23:00:00.000Z");
  });
  it("reads all-day dates as club midnight", () => {
    expect(parseIcsDate("20261006", { VALUE: "DATE" })).toEqual({ iso: "2026-10-06T04:00:00.000Z", allDay: true });
  });
  it("rejects garbage", () => {
    expect(parseIcsDate("tomorrow", {})).toBeNull();
  });
});

describe("parseIcs edge cases", () => {
  it("skips events without a uid, summary or start, and flags cancellations", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:a",
      "SUMMARY:No start",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:b",
      "SUMMARY:Cancelled night",
      "DTSTART;VALUE=DATE:20261010",
      "STATUS:CANCELLED",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:c",
      "SUMMARY:Backwards",
      "DTSTART:20261010T200000Z",
      "DTEND:20261010T190000Z",
      "URL;X-FOO=\"a:b\":https://example.edu/e/3",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const events = parseIcs(text);
    expect(events.map((e) => e.uid)).toEqual(["b", "c"]);
    expect(events[0].cancelled).toBe(true);
    expect(events[0].allDay).toBe(true);
    expect(events[0].endsAt).toBe("2026-10-11T04:00:00.000Z");
    // An end before the start is dropped rather than imported as nonsense.
    expect(events[1].endsAt).toBeNull();
    expect(events[1].url).toBe("https://example.edu/e/3");
  });
});
