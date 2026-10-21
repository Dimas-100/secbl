import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Table talk (spec 2026-10-20-table-talk §1): comments on a live game, as
// yourself only, five per ten seconds, never on a finished game, and gone
// when the game is.
describe.skipIf(!url || !anonKey || !serviceKey)("table talk", () => {
  const admin = createClient(url!, serviceKey!);
  const password = "talk-test-password-1!";
  const stamp = Date.now();
  let aId: string;
  let bId: string;
  let gameId: string;
  // One sign-in for the whole file: Supabase Auth rate-limits password sign-ins.
  let a: SupabaseClient;

  beforeAll(async () => {
    const { data: school } = await admin.from("schools").select("id").limit(1).single();
    async function makeUser(tag: string) {
      const email = `table-talk-${tag}-${stamp}@example.com`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: `Talk ${tag} ${stamp}`, school_id: school!.id },
      });
      if (error) throw error;
      await admin.from("profiles").update({ status: "approved" }).eq("id", data.user!.id);
      return { id: data.user!.id, email };
    }
    const ua = await makeUser("a");
    const ub = await makeUser("b");
    aId = ua.id;
    bId = ub.id;
    a = createClient(url!, anonKey!);
    const { error: signInError } = await a.auth.signInWithPassword({ email: ua.email, password });
    if (signInError) throw signInError;
    const { data: game, error } = await admin
      .from("live_games")
      .upsert({ reporter_id: aId, opponent_id: bId, game_type: "8ball" }, { onConflict: "reporter_id" })
      .select("id")
      .single();
    if (error) throw error;
    gameId = game!.id;
  });

  afterAll(async () => {
    // Live rows and comments cascade from the users.
    await admin.auth.admin.deleteUser(aId);
    await admin.auth.admin.deleteUser(bId);
  });

  it("a member comments on a live game as themselves only", async () => {
    const { data, error } = await a
      .from("live_comments")
      .insert({ game_id: gameId, author_id: aId, body: "  nice shot  " })
      .select("body")
      .single();
    expect(error).toBeNull();
    expect(data!.body).toBe("nice shot");
    const { error: spoof } = await a.from("live_comments").insert({ game_id: gameId, author_id: bId, body: "not me" });
    expect(spoof?.message).toMatch(/row-level security/);
  });

  it("a sixth comment inside ten seconds is refused", async () => {
    for (let i = 0; i < 4; i++) {
      const { error } = await a.from("live_comments").insert({ game_id: gameId, author_id: aId, body: `go ${i}` });
      expect(error).toBeNull();
    }
    const { error } = await a.from("live_comments").insert({ game_id: gameId, author_id: aId, body: "one more" });
    expect(error?.message).toMatch(/commenting too quickly/);
  });

  it("a stale game takes no comments", async () => {
    await new Promise((r) => setTimeout(r, 10_500)); // let the rate window pass
    await admin
      .from("live_games")
      .update({ updated_at: new Date(Date.now() - 4 * 3_600_000).toISOString() })
      .eq("id", gameId);
    const { error } = await a.from("live_comments").insert({ game_id: gameId, author_id: aId, body: "late" });
    expect(error?.message).toMatch(/that game is over/);
    await admin.from("live_games").update({ updated_at: new Date().toISOString() }).eq("id", gameId);
  }, 20_000);

  it("comments go with the game", async () => {
    await admin.from("live_games").delete().eq("id", gameId);
    const { count } = await admin
      .from("live_comments")
      .select("id", { count: "exact", head: true })
      .eq("game_id", gameId);
    expect(count).toBe(0);
  });
});
