import { describe, expect, it } from "vitest";
import { fetchAllPages } from "@/lib/paging";

// PostgREST caps every response at db-max-rows (1000 by default) no matter
// what range is asked for, so whole-table scans must page.
describe("fetchAllPages", () => {
  const rows = Array.from({ length: 2345 }, (_, i) => i);
  const page = async (from: number, to: number) => rows.slice(from, to + 1);

  it("concatenates pages until a short one", async () => {
    const calls: [number, number][] = [];
    const out = await fetchAllPages(async (f, t) => {
      calls.push([f, t]);
      return page(f, t);
    }, 1000);
    expect(out).toEqual(rows);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });
  it("stops on an exact multiple without an extra empty-page surprise", async () => {
    const exact = rows.slice(0, 2000);
    const out = await fetchAllPages(async (f, t) => exact.slice(f, t + 1), 1000);
    expect(out).toEqual(exact);
  });
  it("returns nothing for an empty table", async () => {
    expect(await fetchAllPages(async () => [], 1000)).toEqual([]);
  });
});
