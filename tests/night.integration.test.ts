import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Club night (spec 2026-10-20-club-night §1): the line, the calls, the frees
// and who may do what, against the real project. The test users live in a
// school with no approved real members, so their night is invisible to the
// club; with no such school, or a night already open there, this returns early.
describe.skipIf(!url || !anonKey || !serviceKey)("club night", () => {
  const admin = createClient(url!, serviceKey!);
  const password = "night-test-password-1!";
  const stamp = Date.now();
  const ids: Record<string, string> = {};
  // One sign-in per user for the whole file: Supabase Auth rate-limits them.
  const as: Record<string, SupabaseClient> = {};
  let skip = false;

  beforeAll(async () => {
    const { data: schools } = await admin.from("schools").select("id");
    let schoolId: string | null = null;
    for (const s of schools ?? []) {
      const { count } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("school_id", s.id)
        .eq("status", "approved");
      if (count === 0) {
        schoolId = s.id;
        break;
      }
    }
    if (!schoolId) {
      skip = true;
      return;
    }
    const { count: open } = await admin
      .from("club_nights")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .is("closed_at", null);
    if ((open ?? 0) > 0) {
      skip = true;
      return;
    }
    for (const tag of ["a", "b", "c", "d"]) {
      const email = `night-${tag}-${stamp}@example.com`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: `Night ${tag} ${stamp}`, school_id: schoolId },
      });
      if (error) throw error;
      ids[tag] = data.user!.id;
      await admin.from("profiles").update({ status: "approved" }).eq("id", ids[tag]);
      const client = createClient(url!, anonKey!);
      const { error: signInError } = await client.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      as[tag] = client;
    }
  });

  afterAll(async () => {
    const people = Object.values(ids);
    if (people.length > 0) await admin.from("club_nights").delete().in("opened_by", people);
    for (const id of people) await admin.auth.admin.deleteUser(id);
  });

  const count = async (table: "night_line" | "night_tables", night: string) =>
    (await admin.from(table).select("night_id", { count: "exact", head: true }).eq("night_id", night)).count;

  it("runs a night: line, calls, frees, permissions", async () => {
    if (skip) return;
    const { a, b, c, d } = as;

    const { data: night, error: openErr } = await a.rpc("open_club_night", { p_tables: 1 });
    expect(openErr).toBeNull();
    expect(typeof night).toBe("string");
    const { error: twice } = await a.rpc("open_club_night", { p_tables: 1 });
    expect(twice?.message).toMatch(/already on/);

    const { data: aJoin, error: aJoinErr } = await a.rpc("join_night_line", { p_night: night });
    expect(aJoinErr).toBeNull();
    expect(aJoin).toEqual([]);
    const { error: aAgain } = await a.rpc("join_night_line", { p_night: night });
    expect(aAgain?.message).toMatch(/already in line/);

    const { data: bJoin } = await b.rpc("join_night_line", { p_night: night });
    expect(bJoin).toEqual([{ table_no: 1, player_a: ids.a, player_b: ids.b }]);
    expect(await count("night_line", night)).toBe(0);
    expect(await count("night_tables", night)).toBe(1);

    const { data: cJoin } = await c.rpc("join_night_line", { p_night: night });
    expect(cJoin).toEqual([]);
    const { error: dFree } = await d.rpc("free_night_table", { p_night: night, p_table_no: 1 });
    expect(dFree?.message).toMatch(/Only its players/);

    const { data: called } = await b.rpc("night_table_call", { p_other: ids.a });
    expect(typeof called).toBe("string");
    const { data: freed } = await a.rpc("night_game_reported", { p_other: ids.b });
    expect(freed).toEqual([]);
    expect(await count("night_tables", night)).toBe(0);

    const { data: bBack } = await b.rpc("join_night_line", { p_night: night });
    expect(bBack).toEqual([{ table_no: 1, player_a: ids.c, player_b: ids.b }]);

    const { error: dTables } = await d.rpc("set_night_tables", { p_night: night, p_tables: 2 });
    expect(dTables?.message).toMatch(/Only whoever started/);
    const { error: zero } = await a.rpc("set_night_tables", { p_night: night, p_tables: 0 });
    expect(zero).not.toBeNull();
    const { data: two, error: twoErr } = await a.rpc("set_night_tables", { p_night: night, p_tables: 2 });
    expect(twoErr).toBeNull();
    expect(two).toEqual([]);

    await d.rpc("join_night_line", { p_night: night });
    const { error: leaveErr } = await d.rpc("leave_night_line", { p_night: night });
    expect(leaveErr).toBeNull();
    expect(await count("night_line", night)).toBe(0);

    const { error: closeErr } = await a.rpc("close_club_night", { p_night: night });
    expect(closeErr).toBeNull();
    const { data: closed } = await admin.from("club_nights").select("closed_at").eq("id", night).single();
    expect(closed!.closed_at).not.toBeNull();
    expect(await count("night_line", night)).toBe(0);
    expect(await count("night_tables", night)).toBe(0);
    const { error: late } = await a.rpc("join_night_line", { p_night: night });
    expect(late?.message).toMatch(/over/);
  });
});
