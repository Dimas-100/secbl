import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Posts against the real project (docs/superpowers/specs/2026-10-07-posts-design.md):
// own-folder rules, the daily cap, likes, comments, reports hiding a post and
// an admin clearing it. Rows cascade from the users deleted in afterAll; the
// one uploaded object is removed explicitly.
describe.skipIf(!url || !anonKey || !serviceKey)("posts", () => {
  const admin = createClient(url!, serviceKey!);
  const password = "posts-test-password-1!";
  const stamp = Date.now();
  let a: string;
  let b: string;
  let c: string;
  let adminId: string;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let clientC: SupabaseClient;
  let clientAdmin: SupabaseClient;
  let postId: string;
  const objectPath = () => `${a}/${stamp}.jpg`;

  async function makeUser(tag: string, role: "admin" | "member") {
    const { data: school } = await admin.from("schools").select("id").limit(1).single();
    const email = `posts-${tag}-${stamp}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: email, school_id: school!.id },
    });
    if (error) throw error;
    await admin.from("profiles").update({ role, status: "approved" }).eq("id", data.user!.id);
    const client = createClient(url!, anonKey!);
    const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
    if (signInErr) throw signInErr;
    return { id: data.user!.id, client };
  }

  beforeAll(async () => {
    ({ id: a, client: clientA } = await makeUser("a", "member"));
    ({ id: b, client: clientB } = await makeUser("b", "member"));
    ({ id: c, client: clientC } = await makeUser("c", "member"));
    ({ id: adminId, client: clientAdmin } = await makeUser("admin", "admin"));
  });

  afterAll(async () => {
    await admin.storage.from("posts").remove([objectPath()]);
    for (const id of [a, b, c, adminId]) await admin.auth.admin.deleteUser(id);
  });

  it("a member uploads only into their own folder and posts only their own path", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]); // the smallest thing that is a JPEG
    const wrong = await clientA.storage.from("posts").upload(`${b}/${stamp}.jpg`, bytes, { contentType: "image/jpeg" });
    expect(wrong.error).not.toBeNull();
    const ok = await clientA.storage.from("posts").upload(objectPath(), bytes, { contentType: "image/jpeg" });
    expect(ok.error).toBeNull();

    const forged = await clientA.from("posts").insert({ author_id: a, image_path: `${b}/x.jpg`, caption: "nope" });
    expect(forged.error).not.toBeNull();
    const asOther = await clientA.from("posts").insert({ author_id: b, image_path: objectPath(), caption: "nope" });
    expect(asOther.error).not.toBeNull();

    const { data, error } = await clientA
      .from("posts")
      .insert({ author_id: a, image_path: objectPath(), caption: "clean cut" })
      .select("id")
      .single();
    expect(error).toBeNull();
    postId = data!.id;

    const { data: row } = await admin.from("activity").select("kind, actor_id").eq("post_id", postId).single();
    expect(row).toEqual({ kind: "post", actor_id: a });
  });

  it("the bucket is private: no public URL, but a member can sign one and a stranger cannot read", async () => {
    const signed = await clientB.storage.from("posts").createSignedUrl(objectPath(), 60);
    expect(signed.error).toBeNull();
    const anon = createClient(url!, anonKey!);
    const list = await anon.storage.from("posts").list(a);
    expect(list.data ?? []).toHaveLength(0);
    const pub = anon.storage.from("posts").getPublicUrl(objectPath()).data.publicUrl;
    const res = await fetch(pub);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("likes are one per member and comments are visible to members", async () => {
    expect((await clientB.from("likes").insert({ post_id: postId, profile_id: b })).error).toBeNull();
    expect((await clientB.from("likes").insert({ post_id: postId, profile_id: b })).error).not.toBeNull();
    expect((await clientB.from("likes").insert({ post_id: postId, profile_id: c })).error).not.toBeNull(); // not as someone else
    const { data: comment } = await clientB
      .from("comments")
      .insert({ post_id: postId, author_id: b, body: "nice" })
      .select("id")
      .single();
    const { data: seen } = await clientC.from("comments").select("id").eq("post_id", postId);
    expect(seen?.map((x) => x.id)).toEqual([comment!.id]);
    // The post's author can delete someone else's comment on their post.
    const { count } = await clientA.from("comments").delete({ count: "exact" }).eq("id", comment!.id);
    expect(count).toBe(1);
  });

  it("the sixth post of a club day is refused", async () => {
    for (let i = 0; i < 4; i++) {
      const { error } = await clientA.from("posts").insert({ author_id: a, image_path: `${a}/extra-${i}.jpg` });
      expect(error).toBeNull();
    }
    const sixth = await clientA.from("posts").insert({ author_id: a, image_path: `${a}/extra-6.jpg` });
    expect(sixth.error?.message).toMatch(/five posts a day/);
    // Deleting does not give the slot back: the quota only goes up.
    await admin.from("posts").delete().like("image_path", `${a}/extra-%`);
    const afterDelete = await clientA.from("posts").insert({ author_id: a, image_path: `${a}/extra-7.jpg` });
    expect(afterDelete.error?.message).toMatch(/five posts a day/);
    // A new club day is a new quota (simulated by moving today's row back).
    await admin.from("post_quota").update({ day: "2000-01-01" }).eq("profile_id", a);
    const tomorrow = await clientA.from("posts").insert({ author_id: a, image_path: `${a}/extra-8.jpg` }).select("id").single();
    expect(tomorrow.error).toBeNull();
    await admin.from("posts").delete().like("image_path", `${a}/extra-%`);
  });

  it("three reports hide the post from the feed; an admin clears it; a member cannot comment on a hidden post", async () => {
    expect((await clientB.from("post_reports").insert({ post_id: postId, reporter_id: b, reason: "spam" })).error).toBeNull();
    expect((await clientC.from("post_reports").insert({ post_id: postId, reporter_id: c })).error).toBeNull();
    let { data: p } = await admin.from("posts").select("hidden_at").eq("id", postId).single();
    expect(p!.hidden_at).toBeNull();
    expect((await clientAdmin.from("post_reports").insert({ post_id: postId, reporter_id: adminId })).error).toBeNull();
    ({ data: p } = await admin.from("posts").select("hidden_at").eq("id", postId).single());
    expect(p!.hidden_at).not.toBeNull();
    const { count: rows } = await admin.from("activity").select("id", { count: "exact", head: true }).eq("post_id", postId);
    expect(rows).toBe(0);
    // Hidden: invisible to other members, so a comment is refused; the author still sees it.
    expect((await clientB.from("comments").insert({ post_id: postId, author_id: b, body: "hi" })).error).not.toBeNull();
    const { data: mine } = await clientA.from("posts").select("id").eq("id", postId);
    expect(mine).toHaveLength(1);
    // Reports are admin-only reading.
    expect((await clientB.from("post_reports").select("post_id")).data ?? []).toHaveLength(0);
    expect(((await clientAdmin.from("post_reports").select("post_id").eq("post_id", postId)).data ?? []).length).toBe(3);

    expect((await clientB.rpc("clear_post", { p_post_id: postId })).error?.message).toMatch(/admin/);
    expect((await clientAdmin.rpc("clear_post", { p_post_id: postId })).error).toBeNull();
    ({ data: p } = await admin.from("posts").select("hidden_at").eq("id", postId).single());
    expect(p!.hidden_at).toBeNull();
    const { count: back } = await admin.from("activity").select("id", { count: "exact", head: true }).eq("post_id", postId);
    expect(back).toBe(1);
  });

  it("deleting the post takes the feed row, likes and comments with it; only author or admin may", async () => {
    await clientB.from("comments").insert({ post_id: postId, author_id: b, body: "again" });
    const { count: notMine } = await clientB.from("posts").delete({ count: "exact" }).eq("id", postId);
    expect(notMine).toBe(0);
    const { count: mine } = await clientA.from("posts").delete({ count: "exact" }).eq("id", postId);
    expect(mine).toBe(1);
    const [{ count: act }, { count: likes }, { count: comments }] = await Promise.all([
      admin.from("activity").select("id", { count: "exact", head: true }).eq("post_id", postId),
      admin.from("likes").select("post_id", { count: "exact", head: true }).eq("post_id", postId),
      admin.from("comments").select("id", { count: "exact", head: true }).eq("post_id", postId),
    ]);
    expect([act, likes, comments]).toEqual([0, 0, 0]);
  });
});
