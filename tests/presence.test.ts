import { describe, expect, it } from "vitest";
import { onlineIds } from "@/lib/presence";

describe("onlineIds", () => {
  it("is the set of presence keys with someone present", () => {
    const state = {
      a: [{ id: "a", presence_ref: "1" }],
      b: [{ id: "b", presence_ref: "2" }, { id: "b", presence_ref: "3" }], // two tabs
      ghost: [],
    };
    expect([...onlineIds(state)].sort()).toEqual(["a", "b"]);
    expect(onlineIds({}).size).toBe(0);
  });
  it("ignores whatever a client put in its meta", () => {
    expect([...onlineIds({ c: [{ id: "somebody-else", presence_ref: "9" }] })]).toEqual(["c"]);
  });
});
