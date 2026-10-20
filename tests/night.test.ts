import { describe, expect, it } from "vitest";
import {
  NIGHT_IDLE_MS,
  canFreeTable,
  canManageNight,
  isNightOpen,
  lineOrder,
  myNightStatus,
  nightCardLine,
  tableSlots,
  type LineRow,
  type Night,
  type TableRow,
} from "@/lib/night";

const now = new Date("2026-10-20T23:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const night = (over: Partial<Night> = {}): Night => ({
  id: "n1",
  school_id: "s1",
  opened_by: "starter",
  tables: 2,
  opened_at: ago(3_600_000),
  touched_at: ago(60_000),
  closed_at: null,
  ...over,
});
const line = (profile_id: string, joined_at: string): LineRow => ({ profile_id, joined_at });
const table = (table_no: number, player_a: string, player_b: string): TableRow => ({
  table_no,
  player_a,
  player_b,
  called_at: ago(600_000),
});

describe("isNightOpen", () => {
  it("is open until closed or idle for six hours", () => {
    expect(NIGHT_IDLE_MS).toBe(6 * 3_600_000);
    expect(isNightOpen(null, now)).toBe(false);
    expect(isNightOpen(night({ closed_at: ago(1000) }), now)).toBe(false);
    expect(isNightOpen(night({ touched_at: ago(5 * 3_600_000) }), now)).toBe(true);
    expect(isNightOpen(night({ touched_at: ago(7 * 3_600_000) }), now)).toBe(false);
  });
});

describe("lineOrder", () => {
  it("is first in, first out, ties by id — the order the database calls people in", () => {
    const rows = [line("b", "2026-10-20T22:00:02Z"), line("c", "2026-10-20T22:00:01Z"), line("a", "2026-10-20T22:00:01Z")];
    expect(lineOrder(rows).map((r) => r.profile_id)).toEqual(["a", "c", "b"]);
  });
});

describe("tableSlots", () => {
  it("lists every table, occupied or free", () => {
    expect(tableSlots(3, [table(2, "a", "b")]).map((s) => [s.tableNo, s.row?.player_a ?? null])).toEqual([
      [1, null],
      [2, "a"],
      [3, null],
    ]);
  });
});

describe("myNightStatus", () => {
  const lineup = [line("x", ago(30_000)), line("y", ago(20_000)), line("me", ago(10_000))];
  it("knows whether you're out, waiting, or at a table and who keeps score", () => {
    expect(myNightStatus(null, [], [], "me", now)).toEqual({ kind: "none" });
    expect(myNightStatus(night({ closed_at: ago(1) }), lineup, [], "me", now)).toEqual({ kind: "none" });
    expect(myNightStatus(night(), lineup, [], "me", now)).toEqual({ kind: "waiting", position: 3, ahead: 2 });
    expect(myNightStatus(night(), [], [table(2, "me", "b")], "me", now)).toEqual({
      kind: "playing",
      tableNo: 2,
      opponentId: "b",
      keepsScore: true,
    });
    expect(myNightStatus(night(), [], [table(2, "a", "me")], "me", now)).toEqual({
      kind: "playing",
      tableNo: 2,
      opponentId: "a",
      keepsScore: false,
    });
    expect(myNightStatus(night(), lineup, [table(1, "a", "b")], "zed", now)).toEqual({ kind: "out" });
  });
});

describe("permissions", () => {
  it("lets the starter or an admin run the night, and the players free their own table", () => {
    expect(canManageNight(night(), "starter", false)).toBe(true);
    expect(canManageNight(night(), "someone", true)).toBe(true);
    expect(canManageNight(night(), "someone", false)).toBe(false);
    const t = table(1, "a", "b");
    expect(canFreeTable(t, night(), "a", false)).toBe(true);
    expect(canFreeTable(t, night(), "b", false)).toBe(true);
    expect(canFreeTable(t, night(), "starter", false)).toBe(true);
    expect(canFreeTable(t, night(), "someone", true)).toBe(true);
    expect(canFreeTable(t, night(), "someone", false)).toBe(false);
  });
});

describe("nightCardLine", () => {
  it("says where you stand in one line", () => {
    const counts = { tables: 2, waiting: 5 };
    expect(nightCardLine({ kind: "waiting", position: 1, ahead: 0 }, counts, null)).toBe("You're next in line");
    expect(nightCardLine({ kind: "waiting", position: 3, ahead: 2 }, counts, null)).toBe("You're 3rd in line");
    expect(nightCardLine({ kind: "waiting", position: 2, ahead: 1 }, counts, null)).toBe("You're 2nd in line");
    expect(nightCardLine({ kind: "waiting", position: 11, ahead: 10 }, counts, null)).toBe("You're 11th in line");
    expect(nightCardLine({ kind: "playing", tableNo: 2, opponentId: "b", keepsScore: true }, counts, "Player B")).toBe(
      "You're up on table 2 vs Player B"
    );
    expect(nightCardLine({ kind: "playing", tableNo: 2, opponentId: "a", keepsScore: false }, counts, "Player A")).toBe(
      "Table 2 vs Player A — Player keeps score"
    );
    expect(nightCardLine({ kind: "out" }, counts, null)).toBe("2 tables · 5 in line");
    expect(nightCardLine({ kind: "out" }, { tables: 1, waiting: 0 }, null)).toBe("1 table · nobody in line");
  });
});
