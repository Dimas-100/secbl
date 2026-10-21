import { describe, expect, it } from "vitest";
import {
  PUSH_QUIET_MS,
  addNames,
  mergeComments,
  shouldPushComment,
  shouldResetLive,
  talkSummary,
  validateComment,
  type LiveComment,
} from "@/lib/table-talk";

const c = (id: number, body = `c${id}`, author = "u1"): LiveComment => ({
  id,
  game_id: "g",
  author_id: author,
  body,
  created_at: "2026-10-20T20:00:00Z",
});
const now = new Date("2026-10-20T20:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("mergeComments", () => {
  it("unions by id in ascending order, optimistic rows last in send order", () => {
    expect(mergeComments([c(1), c(3)], [c(2), c(3)]).map((x) => x.id)).toEqual([1, 2, 3]);
    expect(mergeComments([c(1), c(-1)], [c(2)]).map((x) => x.id)).toEqual([1, 2, -1]);
    expect(mergeComments([c(1), c(-1)], [c(-2)]).map((x) => x.id)).toEqual([1, -1, -2]);
    expect(mergeComments([c(1)], [c(2), c(2)]).map((x) => x.id)).toEqual([1, 2]);
  });
});

describe("mergeComments with the sender", () => {
  it("lets your own comment's Realtime echo replace its optimistic copy", () => {
    const pending = c(-1, "Nice shot", "me");
    expect(mergeComments([c(1), pending], [c(5, " Nice shot ", "me")], "me").map((x) => x.id)).toEqual([1, 5]);
    // Someone else saying the same thing does not swallow yours.
    expect(mergeComments([pending], [c(5, "Nice shot", "them")], "me").map((x) => x.id)).toEqual([5, -1]);
    // Two identical sends: one echo replaces only the first.
    expect(mergeComments([pending, c(-2, "Nice shot", "me")], [c(5, "Nice shot", "me")], "me").map((x) => x.id)).toEqual([5, -2]);
  });
});

describe("addNames", () => {
  it("adds what was fetched, settles the rest as Member, and keeps the same object when nothing changes", () => {
    const have = { a: "Player A" };
    expect(addNames(have, ["b", "c"], [{ id: "b", display_name: "Player B" }])).toEqual({
      a: "Player A",
      b: "Player B",
      c: "Member",
    });
    expect(addNames(have, ["a"], [{ id: "a", display_name: "Player A" }])).toBe(have);
    expect(addNames(have, [], [])).toBe(have);
  });
});

describe("talkSummary", () => {
  it("counts real comments and names the newest author by first name", () => {
    expect(talkSummary([c(1, "a"), c(2, "b"), c(3, "c")], { u1: "Player One" })).toEqual({
      count: 3,
      latest: { name: "Player", body: "c" },
    });
    expect(talkSummary([], {})).toEqual({ count: 0, latest: null });
    expect(talkSummary([c(1, "a"), c(-1, "sending")], { u1: "Player One" })).toEqual({
      count: 1,
      latest: { name: "Player", body: "a" },
    });
    expect(talkSummary([c(1, "a", "ghost")], {}).latest).toEqual({ name: "Member", body: "a" });
  });
});

describe("validateComment", () => {
  it("wants 1 to 280 characters after trimming", () => {
    expect(validateComment("   ")).toBe("Write something first.");
    expect(validateComment("x".repeat(281))).toBe("Keep it under 280 characters.");
    expect(validateComment(" hi ")).toBeNull();
    expect(validateComment("x".repeat(280))).toBeNull();
  });
});

describe("shouldResetLive", () => {
  it("starts a new game for a new opponent or a board left for hours", () => {
    expect(shouldResetLive(null, "b", now)).toBe(false);
    expect(shouldResetLive({ updated_at: ago(60_000), opponent_id: "b" }, "b", now)).toBe(false);
    expect(shouldResetLive({ updated_at: ago(60_000), opponent_id: "c" }, "b", now)).toBe(true);
    expect(shouldResetLive({ updated_at: ago(4 * 3_600_000), opponent_id: "b" }, "b", now)).toBe(true);
  });
});

describe("shouldPushComment", () => {
  it("buzzes the players once per quiet spell", () => {
    expect(PUSH_QUIET_MS).toBe(120_000);
    expect(shouldPushComment(null, now)).toBe(true);
    expect(shouldPushComment(ago(30_000), now)).toBe(false);
    expect(shouldPushComment(ago(3 * 60_000), now)).toBe(true);
  });
});
