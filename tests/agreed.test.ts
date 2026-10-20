import { describe, expect, it } from "vitest";
import { AGREED_WINDOW_MS, canFlag, flagDeadlineLabel } from "@/lib/agreed";

// Counted Oct 19, 9:14 PM EDT → the window closes Oct 20, 9:14 PM EDT.
const base = {
  status: "confirmed",
  agreed_at: "2026-10-20T01:14:00Z",
  confirmed_at: "2026-10-20T01:14:00Z",
  opponent_id: "opp",
};
const at = (iso: string) => new Date(iso);

describe("canFlag", () => {
  it("lets only the opponent flag an agreed confirmed game, only inside 24 hours", () => {
    expect(AGREED_WINDOW_MS).toBe(86_400_000);
    expect(canFlag(base, "opp", at("2026-10-20T14:00:00Z"))).toBe(true);
    expect(canFlag(base, "reporter", at("2026-10-20T14:00:00Z"))).toBe(false);
    expect(canFlag(base, "opp", at("2026-10-21T01:14:01Z"))).toBe(false);
    expect(canFlag({ ...base, agreed_at: null }, "opp", at("2026-10-20T14:00:00Z"))).toBe(false);
    expect(canFlag({ ...base, status: "disputed" }, "opp", at("2026-10-20T14:00:00Z"))).toBe(false);
    expect(canFlag({ ...base, confirmed_at: null }, "opp", at("2026-10-20T14:00:00Z"))).toBe(false);
  });
});

describe("flagDeadlineLabel", () => {
  it("gives the deadline in club time, saying tomorrow when it is", () => {
    expect(flagDeadlineLabel("2026-10-20T01:14:00Z", at("2026-10-20T01:30:00Z"))).toBe("tomorrow 9:14 PM");
    expect(flagDeadlineLabel("2026-10-20T01:14:00Z", at("2026-10-20T14:00:00Z"))).toBe("9:14 PM");
  });
});
