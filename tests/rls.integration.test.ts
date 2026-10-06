import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateSingleElim } from "@/lib/bracket";
import { buildRecomputePayload } from "@/lib/recompute";

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
  let eventId: string;

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

    const { data: event, error: eventError } = await admin
      .from("events")
      .insert({
        title: `rls-test-event-${Date.now()}`,
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        created_by: memberId,
      })
      .select("id")
      .single();
    if (eventError) throw eventError;
    eventId = event!.id;
  });

  afterAll(async () => {
    await admin.from("rating_history").delete().in("profile_id", [pendingId, memberId]);
    await admin
      .from("matches")
      .delete()
      .or(
        `reporter_id.eq.${pendingId},reporter_id.eq.${memberId},opponent_id.eq.${pendingId},opponent_id.eq.${memberId}`
      );
    await admin.from("events").delete().eq("id", eventId);
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

  it("a member cannot create an event", async () => {
    const client = await signIn(memberEmail);
    const { error } = await client.from("events").insert({
      title: "unauthorized event",
      starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      created_by: memberId,
    });
    expect(error).not.toBeNull();
  });

  it("a member cannot RSVP on someone else's behalf", async () => {
    const client = await signIn(memberEmail);
    const { error } = await client
      .from("rsvps")
      .insert({ event_id: eventId, profile_id: pendingId, response: "going" });
    expect(error).not.toBeNull();
  });

  it("a member can RSVP for themselves", async () => {
    const client = await signIn(memberEmail);
    const { error } = await client
      .from("rsvps")
      .insert({ event_id: eventId, profile_id: memberId, response: "going" });
    expect(error).toBeNull();
  });

  it("an approved member sees events", async () => {
    const client = await signIn(memberEmail);
    const { data, error } = await client.from("events").select("id").eq("id", eventId);
    expect(error).toBeNull();
    expect(data?.map((e) => e.id)).toEqual([eventId]);
  });

  it("a pending user sees no events", async () => {
    const client = await signIn(pendingEmail);
    const { data } = await client.from("events").select("id");
    expect(data).toEqual([]);
  });

  it("a member can rename themselves", async () => {
    const client = await signIn(memberEmail);
    const { error } = await client.rpc("update_display_name", {
      p_profile_id: memberId,
      p_display_name: "Renamed Member",
    });
    expect(error).toBeNull();
    const { data } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", memberId)
      .single();
    expect(data!.display_name).toBe("Renamed Member");
  });

  it("a member cannot rename someone else", async () => {
    const client = await signIn(memberEmail);
    const { error } = await client.rpc("update_display_name", {
      p_profile_id: pendingId,
      p_display_name: "Hijacked",
    });
    expect(error).not.toBeNull();
    const { data } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", pendingId)
      .single();
    expect(data!.display_name).not.toBe("Hijacked");
  });

  it("a member cannot rename themselves to blank", async () => {
    const client = await signIn(memberEmail);
    const { error } = await client.rpc("update_display_name", {
      p_profile_id: memberId,
      p_display_name: "   ",
    });
    expect(error).not.toBeNull();
  });

  // The reason renaming is a function rather than an RLS policy: a policy
  // permitting "update your own profile row" would also permit these.
  it("a member still cannot self-approve or promote themselves", async () => {
    const client = await signIn(memberEmail);
    await client.from("profiles").update({ role: "admin" }).eq("id", memberId);
    await client.from("profiles").update({ status: "approved" }).eq("id", pendingId);
    const { data: me } = await admin
      .from("profiles")
      .select("role")
      .eq("id", memberId)
      .single();
    const { data: other } = await admin
      .from("profiles")
      .select("status")
      .eq("id", pendingId)
      .single();
    expect(me!.role).toBe("member");
    expect(other!.status).toBe("pending");
  });

  it("a suspended member loses read access to the club", async () => {
    await admin.from("profiles").update({ status: "suspended" }).eq("id", memberId);
    try {
      const client = await signIn(memberEmail);
      const { data: events } = await client.from("events").select("id");
      expect(events).toEqual([]);
      const { data: profiles } = await client.from("profiles").select("id");
      // Only their own row, via the "read own profile" policy.
      expect(profiles?.map((p) => p.id)).toEqual([memberId]);
    } finally {
      await admin.from("profiles").update({ status: "approved" }).eq("id", memberId);
    }
  });

  it("a member cannot create a tournament directly", async () => {
    const client = await signIn(memberEmail);
    const { error } = await client
      .from("tournaments")
      .insert({ name: "unauthorized", created_by: memberId });
    expect(error).not.toBeNull();
  });

  it("a member cannot call the admin tournament functions", async () => {
    const client = await signIn(memberEmail);
    const { error } = await client.rpc("create_tournament", {
      p_name: "unauthorized",
      p_event_id: null,
    });
    expect(error).not.toBeNull();
  });

  it("a member cannot recompute the ladder", async () => {
    const client = await signIn(memberEmail);
    const { error } = await client.rpc("apply_rating_recompute", {
      p_standings: [{ profile_id: memberId, rating: 9999, matches_played: 0 }],
      p_history: [],
      p_deltas: [],
    });
    expect(error).not.toBeNull();
    const { data } = await admin
      .from("profiles")
      .select("rating")
      .eq("id", memberId)
      .single();
    expect(data!.rating).not.toBe(9999);
  });

  it("an approved member can read tournaments", async () => {
    const { data: created } = await admin
      .from("tournaments")
      .insert({ name: `rls-tournament-${Date.now()}`, created_by: memberId })
      .select("id")
      .single();
    try {
      const client = await signIn(memberEmail);
      const { data, error } = await client
        .from("tournaments")
        .select("id")
        .eq("id", created!.id);
      expect(error).toBeNull();
      expect(data?.map((t) => t.id)).toEqual([created!.id]);
    } finally {
      await admin.from("tournaments").delete().eq("id", created!.id);
    }
  });

  // Regression guard: void_tournament_result used to `delete from matches`
  // before clearing rating_history, which violated
  // rating_history_match_id_fkey and left a recorded result impossible to
  // undo. Nothing in tests/ exercised these SQL functions against a real
  // database before this, so the bug survived three review passes.
  it(
    "record_tournament_result then void_tournament_result round-trips cleanly",
    async () => {
      const { data: school } = await admin
        .from("schools")
        .select("id")
        .limit(1)
        .single();

      async function makeEntrant(email: string) {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { display_name: email, school_id: school!.id },
        });
        if (error) throw error;
        return data.user!.id;
      }

      const stamp = Date.now();
      const emails = [0, 1, 2, 3].map((i) => `rls-bracket-${stamp}-${i}@example.com`);

      // Declared outside the try so finally can still see whichever ids were
      // actually created, but populated inside it: these tests run against
      // production, and a failure partway through createUser must not leak
      // real accounts that finally never gets a chance to clean up.
      const ids: string[] = [];
      let tournamentId: string | undefined;
      let matchId: string | undefined;

      try {
        // Sequential, not Promise.all: a parallel rejection can leave
        // sibling creations still in flight with no id ever recorded, so
        // even this try/finally would miss them.
        for (const email of emails) {
          ids.push(await makeEntrant(email));
        }
        const [aId, bId, cId, dId] = ids;

        // A drives every admin-only RPC call below. Nothing stops an admin
        // from also being a tournament entrant.
        await admin
          .from("profiles")
          .update({ role: "admin", status: "approved" })
          .eq("id", aId);

        const adminActor = await signIn(emails[0]);

        const { data: createdId, error: createError } = await adminActor.rpc(
          "create_tournament",
          { p_name: `rls-bracket-${stamp}`, p_event_id: null }
        );
        expect(createError).toBeNull();
        tournamentId = createdId as string;

        const { error: entrantsError } = await adminActor.rpc("set_tournament_entrants", {
          p_tournament_id: tournamentId,
          p_entrants: [
            { profile_id: aId, seed: 1 },
            { profile_id: bId, seed: 2 },
            { profile_id: cId, seed: 3 },
            { profile_id: dId, seed: 4 },
          ],
        });
        expect(entrantsError).toBeNull();

        const bracket = generateSingleElim([aId, bId, cId, dId], () => crypto.randomUUID());
        const { error: startError } = await adminActor.rpc("start_tournament", {
          p_tournament_id: tournamentId,
          p_matches: bracket,
        });
        expect(startError).toBeNull();

        const { data: roundOne, error: roundOneError } = await admin
          .from("tournament_matches")
          .select("id, player1_id, player2_id")
          .eq("tournament_id", tournamentId)
          .eq("round", 1)
          .not("player1_id", "is", null)
          .not("player2_id", "is", null)
          .limit(1);
        expect(roundOneError).toBeNull();
        const chosen = roundOne![0];
        const winnerId = chosen.player1_id as string;
        const loserId = chosen.player2_id as string;

        matchId = crypto.randomUUID();
        const recordPayload = await buildRecomputePayload(admin, [
          {
            id: matchId,
            reporter_id: winnerId,
            opponent_id: loserId,
            winner_id: winnerId,
            confirmed_at: new Date().toISOString(),
          },
        ]);
        const { error: recordError } = await adminActor.rpc("record_tournament_result", {
          p_tournament_match_id: chosen.id,
          p_match_id: matchId,
          p_player1_score: 5,
          p_player2_score: 2,
          p_winner_id: winnerId,
          p_played_at: "2026-08-31",
          ...recordPayload,
        });
        expect(recordError).toBeNull();

        const { data: rated, error: ratedError } = await admin
          .from("matches")
          .select("id, status")
          .eq("id", matchId)
          .single();
        expect(ratedError).toBeNull();
        expect(rated?.status).toBe("confirmed");

        const { data: afterRecord } = await admin
          .from("profiles")
          .select("id, rating")
          .in("id", [winnerId, loserId]);
        expect(afterRecord?.length).toBe(2);
        for (const p of afterRecord ?? []) {
          expect(p.rating).not.toBe(450);
        }

        const voidPayload = await buildRecomputePayload(admin, [], matchId);
        const { error: voidError } = await adminActor.rpc("void_tournament_result", {
          p_tournament_match_id: chosen.id,
          ...voidPayload,
        });
        // THE REGRESSION GUARD: this used to raise
        // rating_history_match_id_fkey. It must succeed.
        expect(voidError).toBeNull();

        const { data: goneMatch } = await admin
          .from("matches")
          .select("id")
          .eq("id", matchId);
        expect(goneMatch).toEqual([]);

        const { data: afterVoid } = await admin
          .from("profiles")
          .select("id, rating")
          .in("id", [winnerId, loserId]);
        expect(afterVoid?.length).toBe(2);
        for (const p of afterVoid ?? []) {
          expect(p.rating).toBe(450);
        }
      } finally {
        // Load-bearing order: rating_history and matches reference the
        // tournament's match ids with no cascade, and tournaments.created_by
        // references profiles(id) with no cascade either — a surviving
        // tournament blocks deleting the user who created it. Tournament
        // (and its cascaded tournament_players/tournament_matches) must go
        // before the four users.
        if (matchId) {
          await admin.from("rating_history").delete().eq("match_id", matchId);
          await admin.from("matches").delete().eq("id", matchId);
        }
        if (tournamentId) {
          await admin.from("tournaments").delete().eq("id", tournamentId);
        }
        for (const id of ids) {
          await admin.auth.admin.deleteUser(id);
        }
      }
    },
    30000
  );

  it("updating a match's tournament_match_id to an unknown id is rejected", async () => {
    const { data: created, error: insertError } = await admin
      .from("matches")
      .insert({
        reporter_id: memberId,
        opponent_id: pendingId,
        winner_id: memberId,
        reporter_score: 5,
        opponent_score: 2,
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();
    try {
      const { error } = await admin
        .from("matches")
        .update({ tournament_match_id: crypto.randomUUID() })
        .eq("id", created!.id);
      // matches.tournament_match_id references tournament_matches(id) — a
      // dangling reference must be rejected by the foreign key, not silently
      // accepted.
      expect(error).not.toBeNull();
    } finally {
      await admin.from("matches").delete().eq("id", created!.id);
    }
  });

  // Live Club (migration 0020): push, school logos, races.

  it("a member manages only their own push subscriptions and prefs", async () => {
    const me = await signIn(memberEmail);
    const sub = { profile_id: memberId, endpoint: `https://push.example/${Date.now()}`, p256dh: "k", auth: "a" };
    try {
      const { error: insErr } = await me.from("push_subscriptions").insert(sub);
      expect(insErr).toBeNull();
      const { error: prefErr } = await me
        .from("notification_prefs")
        .upsert({ profile_id: memberId, messages: false });
      expect(prefErr).toBeNull();
      const { data: mine } = await me.from("push_subscriptions").select("endpoint");
      expect(mine?.map((s) => s.endpoint)).toEqual([sub.endpoint]);
      // A pending (unapproved) account sees nothing, and nobody can plant a
      // subscription on someone else's profile.
      const other = await signIn(pendingEmail);
      const { data: theirs } = await other.from("push_subscriptions").select("id");
      expect(theirs).toEqual([]);
      const { error: forged } = await me
        .from("push_subscriptions")
        .insert({ ...sub, profile_id: pendingId, endpoint: `${sub.endpoint}x` });
      expect(forged).not.toBeNull();
    } finally {
      await admin.from("push_subscriptions").delete().eq("profile_id", memberId);
      await admin.from("notification_prefs").delete().eq("profile_id", memberId);
    }
  });

  it("only admins can set a school logo, and only inside the bucket", async () => {
    const me = await signIn(memberEmail);
    const { data: school } = await admin.from("schools").select("id, logo_url").limit(1).single();
    const { error } = await me.rpc("set_school_logo", {
      p_school_id: school!.id,
      p_url: "https://x/storage/v1/object/public/school-logos/a.png",
    });
    expect(error?.message).toMatch(/admin/i);
    await admin.from("profiles").update({ role: "admin" }).eq("id", memberId);
    try {
      const { error: foreign } = await me.rpc("set_school_logo", {
        p_school_id: school!.id,
        p_url: "https://evil.example/logo.png",
      });
      expect(foreign?.message).toMatch(/school-logos/);
      // The real logo is untouched by the two refusals.
      const { data: after } = await admin.from("schools").select("logo_url").eq("id", school!.id).single();
      expect(after?.logo_url).toBe(school!.logo_url);
    } finally {
      await admin.from("profiles").update({ role: "member" }).eq("id", memberId);
    }
  });

  it("rejects a race whose scores do not reach race_to or whose spot does not fit", async () => {
    const me = await signIn(memberEmail);
    const base = {
      reporter_id: memberId,
      opponent_id: pendingId,
      winner_id: memberId,
      game_type: "8ball",
      played_at: "2026-10-06",
    };
    const { error: short } = await me
      .from("matches")
      .insert({ ...base, reporter_score: 4, opponent_score: 2, race_to: 5 });
    expect(short?.message).toMatch(/matches_race_shape/);
    const { error: bigSpot } = await me
      .from("matches")
      .insert({ ...base, reporter_score: 3, opponent_score: 2, race_to: 3, spot: 3, spot_to: pendingId });
    expect(bigSpot?.message).toMatch(/matches_spot_fits/);
    const { error: orphanSpot } = await me
      .from("matches")
      .insert({ ...base, reporter_score: 3, opponent_score: 2, race_to: 3, spot: 1 });
    expect(orphanSpot?.message).toMatch(/matches_spot_shape/);
    const { error: okErr } = await me
      .from("matches")
      .insert({ ...base, reporter_score: 3, opponent_score: 2, race_to: 3, spot: 2, spot_to: pendingId });
    expect(okErr).toBeNull();
  });
});
