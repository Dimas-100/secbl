import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Shared teardown for the E2E specs.
//
// These tests write to the SAME Supabase project that serves production, so a
// leaked row is real club data. A try/finally inside the test body is NOT
// enough: when Playwright hits its test timeout it abandons the test function
// and the finally block never runs — observed leaking a user into production.
// Playwright does still run afterEach hooks after a timeout, so cleanup belongs
// there, driven by this registry.
export function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const userIds = new Set<string>();
const displayNames = new Set<string>();
const eventTitles = new Set<string>();
const tournamentNames = new Set<string>();
const sourceNames = new Set<string>();
const seasonNames = new Set<string>();

/** Delete any season with this (unique per run) name; its feed rows cascade. */
export function trackSeasonName(name: string) {
  seasonNames.add(name);
}

/** Delete any event source with this (unique per run) name, and the events it imported. */
export function trackSourceName(name: string) {
  sourceNames.add(name);
}

/** Delete this auth user during teardown. profiles cascade from auth.users. */
export function trackUser(id: string) {
  userIds.add(id);
}

/** Find and delete a user by display_name, for when the id was never captured. */
export function trackDisplayName(name: string) {
  displayNames.add(name);
}

/** Delete any event with this (unique per run) title during teardown. */
export function trackEventTitle(title: string) {
  eventTitles.add(title);
}

/** Delete any tournament with this (unique per run) name during teardown. */
export function trackTournamentName(name: string) {
  tournamentNames.add(name);
}

export async function cleanupTracked() {
  const service = serviceClient();

  for (const name of displayNames) {
    const { data } = await service.from("profiles").select("id").eq("display_name", name);
    for (const row of data ?? []) userIds.add(row.id);
  }
  // Events reference profiles(id) with no cascade, so they must go first or
  // deleting the user trips a foreign-key violation and orphans the event.
  for (const title of eventTitles) {
    const { data } = await service.from("events").select("id").eq("title", title);
    for (const row of data ?? []) await service.from("events").delete().eq("id", row.id);
  }
  // Must precede deleteUser: tournaments.created_by has no cascade, so a
  // surviving tournament blocks deletion of the admin who created it.
  //
  // Deleting the tournament alone is not enough. matches.tournament_match_id
  // is ON DELETE SET NULL, not CASCADE (deliberately -- see
  // supabase/migrations/0010b_tournament_integrity.sql -- so that deleting a
  // tournament in production never silently erases real ladder history). So
  // the rated matches recordResult wrote (and their rating_history rows,
  // which reference matches with no cascade either) survive the tournament
  // delete, orphaned with tournament_match_id set to null, still referencing
  // the test players -- which then blocks deleteUser the same way a
  // surviving tournament would. Delete them explicitly, first.
  for (const name of tournamentNames) {
    const { data: tournaments } = await service.from("tournaments").select("id").eq("name", name);
    for (const t of tournaments ?? []) {
      const { data: tMatches } = await service
        .from("tournament_matches")
        .select("id")
        .eq("tournament_id", t.id as string);
      const tMatchIds = (tMatches ?? []).map((m) => m.id as string);
      if (tMatchIds.length > 0) {
        const { data: rated } = await service
          .from("matches")
          .select("id")
          .in("tournament_match_id", tMatchIds);
        const ratedIds = (rated ?? []).map((m) => m.id as string);
        if (ratedIds.length > 0) {
          await service.from("rating_history").delete().in("match_id", ratedIds);
          await service.from("matches").delete().in("id", ratedIds);
        }
      }
    }
    await service.from("tournaments").delete().eq("name", name);
  }
  // Imported events survive a source delete (source_id → null), so remove
  // them first; the source references the admin who created it.
  for (const name of sourceNames) {
    const { data: sources } = await service.from("event_sources").select("id").eq("name", name);
    for (const s of sources ?? []) {
      await service.from("events").delete().eq("source_id", s.id);
      await service.from("event_sources").delete().eq("id", s.id);
    }
  }
  // A season's created_by/champion_id null out on user delete, so this is
  // tidiness, not a blocker — but a leaked test season would sit on every
  // real member's Season tab.
  for (const name of seasonNames) {
    await service.from("seasons").delete().eq("name", name);
  }
  // Messages and memberships cascade from the user, but a DM channel does
  // not (it belongs to the pair), so it would survive as an empty room.
  for (const id of userIds) {
    await service.from("channels").delete().eq("type", "dm").like("dm_key", `%${id}%`);
  }
  // matches.reporter_id / opponent_id and rating_history.profile_id reference
  // profiles with NO cascade, so a test user who played a game cannot be
  // deleted until their matches are gone — deleteUser would fail silently
  // and leak the user into production (observed 2026-10-06 with the race
  // spec). Test users only ever play each other, so nobody's rating is
  // affected by removing these rows.
  for (const id of userIds) {
    const { data: played } = await service
      .from("matches")
      .select("id")
      .or(`reporter_id.eq.${id},opponent_id.eq.${id}`);
    const matchIds = (played ?? []).map((m) => m.id as string);
    if (matchIds.length > 0) {
      await service.from("rating_history").delete().in("match_id", matchIds);
      await service.from("matches").delete().in("id", matchIds);
    }
    await service.from("rating_history").delete().eq("profile_id", id);
  }
  // Post photos live in a private bucket under <user id>/; rows cascade from
  // the user but objects do not.
  for (const id of userIds) {
    const { data: objects } = await service.storage.from("posts").list(id);
    const names = (objects ?? []).map((o) => `${id}/${o.name}`);
    if (names.length > 0) await service.storage.from("posts").remove(names);
  }
  for (const id of userIds) {
    await service.auth.admin.deleteUser(id);
  }

  userIds.clear();
  displayNames.clear();
  eventTitles.clear();
  tournamentNames.clear();
  sourceNames.clear();
  seasonNames.clear();
}
