import { describe, expect, it } from "vitest";
import { onlineIds } from "@/lib/presence";

describe("onlineIds", () => {
  it("reads the member ids out of Realtime presence state", () => {
    const state = {
      a: [{ id: "a", presence_ref: "1" }],
      b: [{ id: "b", presence_ref: "2" }, { id: "b", presence_ref: "3" }], // two tabs
      ghost: [],
    };
    expect([...onlineIds(state)].sort()).toEqual(["a", "b"]);
  });
  it("falls back to the presence key when a meta carries no id", () => {
    expect([...onlineIds({ c: [{ presence_ref: "9" }] })]).toEqual(["c"]);
    expect(onlineIds({}).size).toBe(0);
  });
});
