import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Messaging RLS and function behaviour, executed against the real project
// (the only way to catch policy recursion, safeupdate rejections and trigger
// mistakes — see the memory notes). Every row created here is deleted below.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!url || !anonKey || !serviceKey)("messaging", () => {
  const admin = createClient(url!, serviceKey!);
  const password = "msg-test-password-1!";
  const stamp = Date.now();
  const emails = {
    pending: `msg-pending-${stamp}@example.com`,
    a: `msg-a-${stamp}@example.com`,
    b: `msg-b-${stamp}@example.com`,
    c: `msg-c-${stamp}@example.com`,
    boss: `msg-admin-${stamp}@example.com`,
  };
  const ids: Record<keyof typeof emails, string> = {
    pending: "",
    a: "",
    b: "",
    c: "",
    boss: "",
  };
  let schoolOne: string;
  let schoolTwo: string;
  let everyoneId: string;
  let schoolOneRoomId: string;

  beforeAll(async () => {
    const { data: schools } = await admin.from("schools").select("id").order("short_name").limit(2);
    schoolOne = schools![0].id;
    schoolTwo = schools![1].id;

    async function makeUser(email: string, school: string) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: email, school_id: school },
      });
      if (error) throw error;
      return data.user!.id;
    }
    ids.pending = await makeUser(emails.pending, schoolOne);
    ids.a = await makeUser(emails.a, schoolOne);
    ids.b = await makeUser(emails.b, schoolOne);
    ids.c = await makeUser(emails.c, schoolTwo);
    ids.boss = await makeUser(emails.boss, schoolTwo);
    await admin.from("profiles").update({ status: "approved" }).in("id", [ids.a, ids.b, ids.c]);
    await admin.from("profiles").update({ status: "approved", role: "admin" }).eq("id", ids.boss);

    const { data: everyone } = await admin
      .from("channels")
      .select("id")
      .eq("type", "everyone")
      .single();
    everyoneId = everyone!.id;
    const { data: room } = await admin
      .from("channels")
      .select("id")
      .eq("type", "school")
      .eq("school_id", schoolOne)
      .single();
    schoolOneRoomId = room!.id;
  });

  afterAll(async () => {
    const all = Object.values(ids).filter(Boolean);
    // Messages and memberships cascade from the user; DM channels do not.
    for (const id of all) {
      await admin.from("channels").delete().eq("type", "dm").like("dm_key", `%${id}%`);
    }
    for (const id of all) await admin.auth.admin.deleteUser(id);
  });

  async function signIn(email: string) {
    const client = createClient(url!, anonKey!);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  }

  it("approval auto-joins Everyone and the school room", async () => {
    const a = await signIn(emails.a);
    const { data, error } = await a.rpc("list_my_channels");
    expect(error).toBeNull();
    const types = (data ?? []).map((r: { type: string }) => r.type).sort();
    expect(types).toEqual(["everyone", "school"]);
    const room = (data ?? []).find((r: { type: string }) => r.type === "school");
    expect(room.school_id).toBe(schoolOne);
  });

  it("a pending user has no channels", async () => {
    const p = await signIn(emails.pending);
    const { data: channels } = await p.from("channels").select("id");
    expect(channels).toEqual([]);
    const { data: inbox } = await p.rpc("list_my_channels");
    expect(inbox).toEqual([]);
  });

  it("a member of another school cannot see or post in this school's room", async () => {
    const c = await signIn(emails.c);
    const { data: visible } = await c.from("channels").select("id").eq("id", schoolOneRoomId);
    expect(visible).toEqual([]);
    const { error } = await c
      .from("messages")
      .insert({ channel_id: schoolOneRoomId, sender_id: ids.c, body: "sneaking in" });
    expect(error).not.toBeNull();
  });

  it("members post to Everyone and every approved member reads it", async () => {
    const a = await signIn(emails.a);
    const { data: posted, error } = await a
      .from("messages")
      .insert({ channel_id: everyoneId, sender_id: ids.a, body: "  rack em  ", client_id: "t1" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(posted!.body).toBe("rack em"); // trimmed by the trigger
    expect(posted!.client_id).toBe("t1");

    const c = await signIn(emails.c);
    const { data: seen } = await c.from("messages").select("id").eq("id", posted!.id);
    expect(seen?.map((m) => m.id)).toEqual([posted!.id]);
  });

  it("a member cannot post as someone else", async () => {
    const a = await signIn(emails.a);
    const { error } = await a
      .from("messages")
      .insert({ channel_id: everyoneId, sender_id: ids.b, body: "impersonation" });
    expect(error).not.toBeNull();
  });

  it("a member cannot post an empty or oversized message", async () => {
    const a = await signIn(emails.a);
    const { error: blank } = await a
      .from("messages")
      .insert({ channel_id: everyoneId, sender_id: ids.a, body: "   " });
    expect(blank).not.toBeNull();
    const { error: huge } = await a
      .from("messages")
      .insert({ channel_id: everyoneId, sender_id: ids.a, body: "x".repeat(2001) });
    expect(huge).not.toBeNull();
  });

  it("a DM is created once, shared by both, and invisible to everyone else", async () => {
    const a = await signIn(emails.a);
    const { data: dmId, error } = await a.rpc("get_or_create_dm", { p_other_id: ids.b });
    expect(error).toBeNull();
    expect(typeof dmId).toBe("string");

    // Idempotent, from either side.
    const b = await signIn(emails.b);
    const { data: again } = await b.rpc("get_or_create_dm", { p_other_id: ids.a });
    expect(again).toBe(dmId);

    const { data: sent } = await a
      .from("messages")
      .insert({ channel_id: dmId, sender_id: ids.a, body: "rematch tonight?" })
      .select("id")
      .single();

    const { data: bSees } = await b.from("messages").select("id").eq("channel_id", dmId);
    expect(bSees?.map((m) => m.id)).toEqual([sent!.id]);

    // Neither a third member nor an admin can read a DM they are not in.
    const c = await signIn(emails.c);
    const { data: cSees } = await c.from("messages").select("id").eq("channel_id", dmId);
    expect(cSees).toEqual([]);
    const boss = await signIn(emails.boss);
    const { data: bossSees } = await boss.from("messages").select("id").eq("channel_id", dmId);
    expect(bossSees).toEqual([]);
    const { data: bossChannels } = await boss.from("channels").select("id").eq("id", dmId);
    expect(bossChannels).toEqual([]);
    const { error: bossPost } = await boss
      .from("messages")
      .insert({ channel_id: dmId, sender_id: ids.boss, body: "admin barging in" });
    expect(bossPost).not.toBeNull();
  });

  it("unread counts the other side's messages and clears on mark_channel_read", async () => {
    const a = await signIn(emails.a);
    const { data: dmId } = await a.rpc("get_or_create_dm", { p_other_id: ids.b });

    const b = await signIn(emails.b);
    const { data: before } = await b.rpc("unread_total");
    expect(Number(before)).toBeGreaterThanOrEqual(1);
    const { data: inbox } = await b.rpc("list_my_channels");
    const dmRow = (inbox ?? []).find((r: { id: string }) => r.id === dmId);
    expect(dmRow.other_id).toBe(ids.a);
    expect(Number(dmRow.unread)).toBeGreaterThanOrEqual(1);
    expect(dmRow.last_body).toBe("rematch tonight?");

    const { error } = await b.rpc("mark_channel_read", { p_channel_id: dmId });
    expect(error).toBeNull();
    const { data: inboxAfter } = await b.rpc("list_my_channels");
    const dmAfter = (inboxAfter ?? []).find((r: { id: string }) => r.id === dmId);
    expect(Number(dmAfter.unread)).toBe(0);

    // Your own messages never count as unread for you.
    const { data: aInbox } = await a.rpc("list_my_channels");
    const aDm = (aInbox ?? []).find((r: { id: string }) => r.id === dmId);
    expect(Number(aDm.unread)).toBe(0);
  });

  it("you cannot DM yourself or someone who is not approved", async () => {
    const a = await signIn(emails.a);
    const { error: self } = await a.rpc("get_or_create_dm", { p_other_id: ids.a });
    expect(self).not.toBeNull();
    const { error: pending } = await a.rpc("get_or_create_dm", { p_other_id: ids.pending });
    expect(pending).not.toBeNull();
    const p = await signIn(emails.pending);
    const { error: fromPending } = await p.rpc("get_or_create_dm", { p_other_id: ids.a });
    expect(fromPending).not.toBeNull();
  });

  it("the rate limiter stops a flood", async () => {
    const c = await signIn(emails.c);
    let failures = 0;
    for (let i = 0; i < 10; i++) {
      const { error } = await c
        .from("messages")
        .insert({ channel_id: everyoneId, sender_id: ids.c, body: `flood ${i}` });
      if (error) failures += 1;
    }
    expect(failures).toBeGreaterThanOrEqual(1);
    expect(failures).toBeLessThanOrEqual(2);
  });

  it("suspension leaves the group rooms; reinstating rejoins them", async () => {
    await admin.from("profiles").update({ status: "suspended" }).eq("id", ids.b);
    const { data: gone } = await admin
      .from("channel_members")
      .select("channel_id, channels!inner(type)")
      .eq("profile_id", ids.b);
    const types = (gone ?? []).map((r) => {
      const ch = Array.isArray(r.channels) ? r.channels[0] : r.channels;
      return (ch as { type: string }).type;
    });
    expect(types).not.toContain("everyone");
    expect(types).not.toContain("school");
    expect(types).toContain("dm"); // DMs survive for when they come back

    await admin.from("profiles").update({ status: "approved" }).eq("id", ids.b);
    const { data: back } = await admin
      .from("channel_members")
      .select("channel_id, channels!inner(type)")
      .eq("profile_id", ids.b);
    const typesBack = (back ?? [])
      .map((r) => {
        const ch = Array.isArray(r.channels) ? r.channels[0] : r.channels;
        return (ch as { type: string }).type;
      })
      .sort();
    expect(typesBack).toEqual(["dm", "everyone", "school"]);
  });

  it("changing school moves the member to the new school room", async () => {
    await admin.from("profiles").update({ school_id: schoolTwo }).eq("id", ids.a);
    const { data: rooms } = await admin
      .from("channel_members")
      .select("channels!inner(type, school_id)")
      .eq("profile_id", ids.a);
    const schoolRooms = (rooms ?? [])
      .map((r) => (Array.isArray(r.channels) ? r.channels[0] : r.channels) as {
        type: string;
        school_id: string | null;
      })
      .filter((c) => c.type === "school");
    expect(schoolRooms.map((c) => c.school_id)).toEqual([schoolTwo]);
  });
});
