import { describe, expect, it } from "vitest";
import type { IcsEvent } from "@/lib/ics";
import { planSync, type ImportedEvent } from "@/lib/event-sync";

const now = new Date("2026-10-06T12:00:00Z");

const feedEvent = (over: Partial<IcsEvent> = {}): IcsEvent => ({
  uid: "https://pin.gsu.edu/event/1",
  summary: "Club Night",
  description: "Open tables.",
  location: "Rack Room",
  url: "https://pin.gsu.edu/event/1",
  startsAt: "2026-10-08T23:00:00.000Z",
  endsAt: "2026-10-09T02:00:00.000Z",
  allDay: false,
  cancelled: false,
  ...over,
});

const imported = (over: Partial<ImportedEvent> = {}): ImportedEvent => ({
  id: "e1",
  external_uid: "https://pin.gsu.edu/event/1",
  title: "Club Night",
  description: "Open tables.",
  location: "Rack Room",
  starts_at: "2026-10-08T23:00:00+00:00",
  ends_at: "2026-10-09T02:00:00+00:00",
  status: "scheduled",
  external_url: "https://pin.gsu.edu/event/1",
  ...over,
});

describe("planSync", () => {
  it("inserts new feed events and ignores cancelled ones it never had", () => {
    const plan = planSync([feedEvent(), feedEvent({ uid: "x", cancelled: true })], [], now);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]).toMatchObject({ external_uid: "https://pin.gsu.edu/event/1", title: "Club Night" });
    expect(plan.updates).toEqual([]);
    expect(plan.cancels).toEqual([]);
  });

  it("does nothing when the feed matches what we have, even with a different ISO offset spelling", () => {
    expect(planSync([feedEvent()], [imported()], now)).toEqual({ inserts: [], updates: [], cancels: [] });
  });

  it("patches only the changed fields", () => {
    const plan = planSync(
      [feedEvent({ location: "Table 3", endsAt: "2026-10-09T03:00:00.000Z" })],
      [imported()],
      now
    );
    expect(plan.updates).toEqual([
      { id: "e1", patch: { location: "Table 3", ends_at: "2026-10-09T03:00:00.000Z" } },
    ]);
  });

  it("cancels upcoming events that vanished or were cancelled upstream, never past ones", () => {
    const past = imported({ id: "old", external_uid: "u-old", starts_at: "2026-09-01T23:00:00Z", ends_at: "2026-09-02T01:00:00Z" });
    const gone = imported({ id: "gone", external_uid: "u-gone" });
    const cancelledUpstream = imported({ id: "cu", external_uid: "u-cu" });
    const plan = planSync(
      [feedEvent({ uid: "u-cu", cancelled: true })],
      [past, gone, cancelledUpstream],
      now
    );
    expect(plan.cancels.sort()).toEqual(["cu", "gone"]);
    expect(plan.updates).toEqual([]);
  });

  it("restores an event that comes back after being cancelled", () => {
    const plan = planSync([feedEvent()], [imported({ status: "cancelled" })], now);
    expect(plan.updates).toEqual([{ id: "e1", patch: { status: "scheduled" } }]);
    expect(plan.cancels).toEqual([]);
  });

  it("truncates oversized descriptions and titles", () => {
    const plan = planSync([feedEvent({ summary: "T".repeat(200), description: "D".repeat(5000) })], [], now);
    expect(plan.inserts[0].title).toHaveLength(120);
    expect(plan.inserts[0].description).toHaveLength(2000);
  });
});
