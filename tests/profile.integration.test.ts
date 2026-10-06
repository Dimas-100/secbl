import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Profile personalization guards, executed against the real project.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!url || !anonKey || !serviceKey)("profile personalization", () => {
  const admin = createClient(url!, serviceKey!);
  const password = "profile-test-password-1!";
  const stamp = Date.now();
  const email = `profile-${stamp}@example.com`;
  let id: string;
  let me: SupabaseClient;

  beforeAll(async () => {
    const { data: school } = await admin.from("schools").select("id").limit(1).single();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: `profile-${stamp}`, school_id: school!.id },
    });
    if (error) throw error;
    id = data.user!.id;
    await admin.from("profiles").update({ status: "approved" }).eq("id", id);
    me = createClient(url!, anonKey!, { auth: { persistSession: false } });
    const { error: signInError } = await me.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  });

  afterAll(async () => {
    const { data: files } = await admin.storage.from("avatars").list(id);
    if (files && files.length > 0) {
      await admin.storage.from("avatars").remove(files.map((f) => `${id}/${f.name}`));
    }
    await admin.auth.admin.deleteUser(id);
  });

  it("saves ball, tagline and favourite game, and rejects bad values", async () => {
    const ok = await me.rpc("update_profile_prefs", { p_ball: 9, p_tagline: "  Stripes only.  ", p_favorite_game: "9ball" });
    expect(ok.error).toBeNull();
    const { data } = await admin.from("profiles").select("ball, tagline, favorite_game").eq("id", id).single();
    expect(data).toEqual({ ball: 9, tagline: "Stripes only.", favorite_game: "9ball" });

    const badBall = await me.rpc("update_profile_prefs", { p_ball: 16, p_tagline: null, p_favorite_game: null });
    expect(badBall.error).not.toBeNull();
    const longTag = await me.rpc("update_profile_prefs", { p_ball: null, p_tagline: "x".repeat(61), p_favorite_game: null });
    expect(longTag.error).not.toBeNull();
  });

  it("only accepts a photo URL on this project's Storage, in my folder, that exists", async () => {
    const path = `${id}/avatar-test.jpg`;
    const { error: upErr } = await me.storage
      .from("avatars")
      .upload(path, new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), { contentType: "image/jpeg" });
    expect(upErr).toBeNull();
    const publicUrl = me.storage.from("avatars").getPublicUrl(path).data.publicUrl;

    const real = await me.rpc("set_avatar_url", { p_url: publicUrl });
    expect(real.error).toBeNull();

    // Another host that merely contains the right substring.
    const evil = await me.rpc("set_avatar_url", {
      p_url: `https://evil.example/x/storage/v1/object/public/avatars/${id}/avatar-test.jpg`,
    });
    expect(evil.error).not.toBeNull();

    // Right origin and folder, but no such object.
    const missing = await me.rpc("set_avatar_url", {
      p_url: publicUrl.replace("avatar-test.jpg", "nope.jpg"),
    });
    expect(missing.error).not.toBeNull();

    // Someone else's folder.
    const other = await me.rpc("set_avatar_url", {
      p_url: publicUrl.replace(id, "00000000-0000-0000-0000-000000000000"),
    });
    expect(other.error).not.toBeNull();

    const { data } = await admin.from("profiles").select("avatar_url").eq("id", id).single();
    expect(data!.avatar_url).toBe(publicUrl);

    const cleared = await me.rpc("set_avatar_url", { p_url: null });
    expect(cleared.error).toBeNull();
  });

  it("cannot write into another member's avatar folder", async () => {
    const { error } = await me.storage
      .from("avatars")
      .upload(`00000000-0000-0000-0000-000000000000/sneaky.jpg`, new Blob([new Uint8Array([1])]), {
        contentType: "image/jpeg",
      });
    expect(error).not.toBeNull();
  });
});
