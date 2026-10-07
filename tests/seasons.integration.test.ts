import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

// Seasons, the feed triggers and the new tables, against the real project
// (docs/superpowers/specs/2026-10-06-seasons-feed-live-design.md). Every row
// created here is deleted in afterAll; seasons cascade their activity.
describe.skipIf(!url || !anonKey || !serviceKey)("seasons and the activity feed", () => {
  const admin = createClient(url!, serviceKey!);
  const password = "season-test-password-1!";
  const stamp = Date.now();
  const adminEmail = `season-admin-${stamp}@example.com`;
  const memberEmail = `season-member-${stamp}@example.com`;
  let adminId: string;
  let memberId: string;
  let otherId: string;
  const seasonIds: string[] = [];
  const matchIds: string[] = [];

  async function makeUser(email: string, role: "admin" | "member") {
    const { data: school } = await admin.from("schools").select("id").limit(1).single();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: email, school_id: school!.id },
    });
    if (error) throw error;
    await admin.from("profiles").update({ role, status: "approved" }).eq("id", data.user!.id);
    return data.user!.id;
  }

  async function signIn(email: string) {
    const client = createClient(url!, anonKey!);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  }

  beforeAll(async () => {
    adminId = await makeUser(adminEmail, "admin");
    memberId = await makeUser(memberEmail, "member");
    otherId = await makeUser(`season-other-${stamp}@example.com`, "member");
  });

  afterAll(async () => {
    if (seasonIds.length > 0) await admin.from("seasons").delete().in("id", seasonIds);
    if (matchIds.length > 0) {
      await admin.from("rating_history").delete().in("match_id", matchIds);
      await admin.from("matches").delete().in("id", matchIds);
    }
    for (const id of [adminId, memberId, otherId]) await admin.auth.admin.deleteUser(id);
  });

  it("a new member is a feed moment", async () => {
    const { data } = await admin.from("activity").select("kind").eq("actor_id", memberId);
    expect(data?.map((r) => r.kind)).toContain("member_joined");
  });

  it("only an admin opens a season, and only one at a time", async () => {
    const member = await signIn(memberEmail);
    const refused = await member.rpc("open_season", { p_name: `T ${stamp}`, p_starts_on: day(0), p_ends_on: null });
    expect(refused.error?.message).toMatch(/admin/);

    const adm = await signIn(adminEmail);
    // A season may already be open in production: open ours only when none is.
    const { data: existing } = await admin.from("seasons").select("id").eq("status", "open").maybeSingle();
    if (existing) {
      const again = await adm.rpc("open_season", { p_name: `T ${stamp}`, p_starts_on: day(0), p_ends_on: null });
      expect(again.error?.message).toMatch(/already open/);
      return;
    }
    const { data: id, error } = await adm.rpc("open_season", {
      p_name: `Test season ${stamp}`,
      p_starts_on: day(-30),
      p_ends_on: day(30),
    });
    expect(error).toBeNull();
    seasonIds.push(id as string);
    const again = await adm.rpc("open_season", { p_name: "second", p_starts_on: day(0), p_ends_on: null });
    expect(again.error?.message).toMatch(/already open/);

    const { data: opened } = await admin.from("activity").select("kind, data").eq("season_id", id as string);
    expect(opened?.map((r) => r.kind)).toEqual(["season_opened"]);
  });

  it("members read seasons, activity and live games but cannot write them", async () => {
    const member = await signIn(memberEmail);
    const { error: readErr } = await member.from("seasons").select("id").limit(1);
    expect(readErr).toBeNull();
    const { error: feedErr } = await member.from("activity").select("id").limit(1);
    expect(feedErr).toBeNull();
    const { error: liveReadErr } = await member.from("live_games").select("reporter_id").limit(1);
    expect(liveReadErr).toBeNull();
    const act = await member.from("activity").insert({ kind: "member_joined", actor_id: memberId });
    expect(act.error).not.toBeNull();
    const live = await member
      .from("live_games")
      .insert({ reporter_id: memberId, opponent_id: otherId, game_type: "8ball" });
    expect(live.error).not.toBeNull();
    const { count } = await admin
      .from("live_games")
      .select("reporter_id", { count: "exact", head: true })
      .eq("reporter_id", memberId);
    expect(count).toBe(0);
  });

  it("a confirmed match is one feed row; leaving confirmed removes it and every derived moment", async () => {
    const { data: m, error } = await admin
      .from("matches")
      .insert({
        reporter_id: memberId,
        opponent_id: otherId,
        winner_id: memberId,
        reporter_score: 3,
        opponent_score: 1,
        game_type: "8ball",
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        played_at: day(0),
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    matchIds.push(m!.id);

    const rows = async () => (await admin.from("activity").select("kind, actor_id").eq("match_id", m!.id)).data ?? [];
    let got = await rows();
    expect(got).toEqual([{ kind: "match", actor_id: memberId }]);

    // Re-saving a confirmed row never duplicates the feed row.
    await admin.from("matches").update({ status: "confirmed" }).eq("id", m!.id);
    expect((await rows()).filter((r) => r.kind === "match")).toHaveLength(1);

    const { error: badgeErr } = await admin
      .from("activity")
      .insert({ kind: "badge", actor_id: memberId, match_id: m!.id, data: { title: "Regular", level: 5 } });
    expect(badgeErr).toBeNull();
    got = await rows();
    expect(got.map((r) => r.kind).sort()).toEqual(["badge", "match"]);

    await admin.from("matches").update({ status: "disputed" }).eq("id", m!.id);
    expect(await rows()).toEqual([]);
  });

  it("closing early trims ends_on to today, crowns the champion and posts the standings", async () => {
    const adm = await signIn(adminEmail);
    const { data: existing } = await admin.from("seasons").select("id").eq("status", "open").maybeSingle();
    if (!existing || !seasonIds.includes(existing.id)) return; // production's season is not ours to close
    const podium = [{ id: memberId, points: 3 }];
    const { error } = await adm.rpc("close_season", {
      p_season_id: existing.id,
      p_champion_id: memberId,
      p_today: day(0),
      p_podium: podium,
    });
    expect(error).toBeNull();
    const { data: s } = await admin.from("seasons").select("status, ends_on, champion_id, closed_at").eq("id", existing.id).single();
    expect(s).toMatchObject({ status: "closed", ends_on: day(0), champion_id: memberId });
    expect(s!.closed_at).not.toBeNull();
    const { data: closed } = await admin
      .from("activity")
      .select("actor_id, data")
      .eq("season_id", existing.id)
      .eq("kind", "season_closed")
      .single();
    expect(closed?.actor_id).toBe(memberId);
    expect(closed?.data).toMatchObject({ points: 3 });

    // Late close: a season whose planned end already passed keeps that end.
    const { data: lateId, error: openErr } = await adm.rpc("open_season", {
      p_name: `Late ${stamp}`,
      p_starts_on: day(1),
      p_ends_on: day(1),
    });
    expect(openErr).toBeNull();
    seasonIds.push(lateId as string);
    // Closing "today" before it starts is refused; closing on a day after the
    // planned end keeps the planned end.
    const early = await adm.rpc("close_season", { p_season_id: lateId, p_champion_id: null, p_today: day(0), p_podium: [] });
    expect(early.error?.message).toMatch(/before it starts/);
    const late = await adm.rpc("close_season", { p_season_id: lateId, p_champion_id: null, p_today: day(5), p_podium: [] });
    expect(late.error).toBeNull();
    const { data: l } = await admin.from("seasons").select("ends_on, champion_id").eq("id", lateId as string).single();
    expect(l).toEqual({ ends_on: day(1), champion_id: null });
  });
});
