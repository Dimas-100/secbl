import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!url || !anonKey || !serviceKey)("RLS policies", () => {
  const admin = createClient(url!, serviceKey!);
  const password = "rls-test-password-1!";
  const pendingEmail = `rls-pending-${Date.now()}@example.com`;
  const memberEmail = `rls-member-${Date.now()}@example.com`;
  let pendingId: string;
  let memberId: string;

  beforeAll(async () => {
    const { data: school } = await admin.from("schools").select("id").limit(1).single();
    async function makeUser(email: string) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: email, school_id: school!.id },
      });
      if (error) throw error;
      return data.user!.id;
    }
    pendingId = await makeUser(pendingEmail);
    memberId = await makeUser(memberEmail);
    await admin.from("profiles").update({ status: "approved" }).eq("id", memberId);
  });

  afterAll(async () => {
    await admin.from("rating_history").delete().in("profile_id", [pendingId, memberId]);
    await admin
      .from("matches")
      .delete()
      .or(
        `reporter_id.eq.${pendingId},reporter_id.eq.${memberId},opponent_id.eq.${pendingId},opponent_id.eq.${memberId}`
      );
    await admin.auth.admin.deleteUser(pendingId);
    await admin.auth.admin.deleteUser(memberId);
  });

  async function signIn(email: string) {
    const client = createClient(url!, anonKey!);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  }

  it("a pending user sees only their own profile", async () => {
    const client = await signIn(pendingEmail);
    const { data } = await client.from("profiles").select("id");
    expect(data?.map((p) => p.id)).toEqual([pendingId]);
  });

  it("a member cannot update their own rating", async () => {
    const client = await signIn(memberEmail);
    await client.from("profiles").update({ rating: 9999 }).eq("id", memberId);
    const { data } = await admin
      .from("profiles")
      .select("rating")
      .eq("id", memberId)
      .single();
    expect(data!.rating).not.toBe(9999);
  });

  it("a member cannot call apply_match_confirmation", async () => {
    const client = await signIn(memberEmail);
    const { error } = await client.rpc("apply_match_confirmation", {
      p_match_id: "00000000-0000-0000-0000-000000000000",
      p_reporter_delta: 0,
      p_opponent_delta: 0,
    });
    expect(error).not.toBeNull();
  });
});
