import { describe, expect, it } from "vitest";
import { NAV_MAX, canGoBack, nextNavStack, parseNavStack } from "@/lib/nav-stack";

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
