import { describe, expect, it } from "vitest";
import { WEEK_LEFT_DAYS, weekLeftDue } from "@/lib/season-tick";

describe("weekLeftDue", () => {
  const open = { status: "open", ends_on: "2026-12-12" };
  it("is due exactly one week before a planned end, once", () => {
    expect(WEEK_LEFT_DAYS).toBe(7);
    expect(weekLeftDue(open, "2026-12-05", false)).toBe(true);
    expect(weekLeftDue(open, "2026-12-04", false)).toBe(false);
    expect(weekLeftDue(open, "2026-12-06", false)).toBe(false);
    expect(weekLeftDue(open, "2026-12-05", true)).toBe(false);
  });
  it("never fires without a planned end or for a closed season", () => {
    expect(weekLeftDue({ status: "open", ends_on: null }, "2026-12-05", false)).toBe(false);
    expect(weekLeftDue({ status: "closed", ends_on: "2026-12-12" }, "2026-12-05", false)).toBe(false);
  });
});
