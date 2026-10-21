import { describe, expect, it } from "vitest";
import { NAV_MAX, canGoBack, nextNavStack, parseNavStack, shouldResetStack } from "@/lib/nav-stack";

describe("nextNavStack", () => {
  it("starts a stack", () => {
    expect(nextNavStack([], "/")).toEqual(["/"]);
  });
  it("ignores the same path", () => {
    expect(nextNavStack(["/"], "/")).toEqual(["/"]);
  });
  it("pops when returning to the previous path (the browser's back)", () => {
    expect(nextNavStack(["/", "/players/x"], "/")).toEqual(["/"]);
  });
  it("pushes a new path", () => {
    expect(nextNavStack(["/a"], "/b")).toEqual(["/a", "/b"]);
  });
  it("caps the stack, keeping the newest", () => {
    const full = Array.from({ length: NAV_MAX }, (_, i) => `/p${i}`);
    const next = nextNavStack(full, "/new");
    expect(next).toHaveLength(NAV_MAX);
    expect(next[next.length - 1]).toBe("/new");
    expect(next[0]).toBe("/p1");
  });
});

describe("parseNavStack", () => {
  it("returns an empty stack for null or bad JSON", () => {
    expect(parseNavStack(null)).toEqual([]);
    expect(parseNavStack("{bad")).toEqual([]);
    expect(parseNavStack('{"a":1}')).toEqual([]);
  });
  it("drops entries that are not strings", () => {
    expect(parseNavStack('["/",3]')).toEqual(["/"]);
  });
});

describe("canGoBack", () => {
  it("needs a previous entry", () => {
    expect(canGoBack(["/"])).toBe(false);
    expect(canGoBack([])).toBe(false);
    expect(canGoBack(["/", "/x"])).toBe(true);
  });
});

describe("entries with a query string", () => {
  it("push onto a different path", () => {
    expect(nextNavStack(["/"], "/leaderboard?tab=players")).toEqual(["/", "/leaderboard?tab=players"]);
  });

  // Ruling S3-R5: tabs and range pickers navigate with replace, so a query
  // change on the same path replaces the top, as the browser history does.
  it("replace the top on the same path", () => {
    const a = nextNavStack(["/", "/leaderboard?tab=players"], "/leaderboard?tab=schools");
    expect(a).toEqual(["/", "/leaderboard?tab=schools"]);
    expect(nextNavStack(a, "/leaderboard?tab=players")).toEqual(["/", "/leaderboard?tab=players"]);
    expect(nextNavStack(a, "/leaderboard?tab=schools")).toBe(a);
    expect(nextNavStack(["/", "/leaderboard"], "/leaderboard?tab=players")).toEqual(["/", "/leaderboard?tab=players"]);
  });

  it("keep a deep link with nothing behind it unable to go back after a range switch", () => {
    const next = nextNavStack(["/players/x"], "/players/x?range=month");
    expect(next).toEqual(["/players/x?range=month"]);
    expect(canGoBack(next)).toBe(false);
    expect(nextNavStack(["/", "/players/x"], "/players/x?range=all")).toEqual(["/", "/players/x?range=all"]);
  });

  it("still pop when returning to the entry below", () => {
    expect(nextNavStack(["/leaderboard?tab=players", "/players/b"], "/leaderboard?tab=players")).toEqual([
      "/leaderboard?tab=players",
    ]);
  });
});

describe("shouldResetStack", () => {
  const origin = "https://secbl.example";
  it("resets a fresh navigation from outside the app", () => {
    expect(shouldResetStack("navigate", "https://other.example/x", origin)).toBe(true);
    expect(shouldResetStack("navigate", "", origin)).toBe(true);
    expect(shouldResetStack("navigate", "not a url", origin)).toBe(true);
  });
  it("keeps the trail for a same-origin navigation", () => {
    expect(shouldResetStack("navigate", `${origin}/players/x`, origin)).toBe(false);
  });
  it("keeps the trail on reload, back/forward or unknown type", () => {
    expect(shouldResetStack("reload", "", origin)).toBe(false);
    expect(shouldResetStack("back_forward", "", origin)).toBe(false);
    expect(shouldResetStack(undefined, "", origin)).toBe(false);
  });
});
