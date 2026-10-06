// PostgREST caps every response at the project's db-max-rows (1000 by
// default) regardless of the Range asked for, so a whole-table scan has to
// page. `fetchPage(from, to)` is an inclusive range, like supabase-js
// `.range()`; paging stops at the first page shorter than `pageSize`.
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<T[]>,
  pageSize = 1000,
  maxPages = 100
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const rows = await fetchPage(from, from + pageSize - 1);
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}
