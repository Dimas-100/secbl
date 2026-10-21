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
  it("push and pop like paths", () => {
    const a = nextNavStack(["/"], "/leaderboard?tab=players");
    expect(a).toEqual(["/", "/leaderboard?tab=players"]);
    const b = nextNavStack(a, "/leaderboard?tab=schools");
    expect(b).toEqual(["/", "/leaderboard?tab=players", "/leaderboard?tab=schools"]);
    expect(nextNavStack(b, "/leaderboard?tab=players")).toEqual(["/", "/leaderboard?tab=players"]);
    expect(nextNavStack(b, "/leaderboard?tab=schools")).toBe(b);
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
