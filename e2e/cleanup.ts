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
  for (const name of tournamentNames) {
    await service.from("tournaments").delete().eq("name", name);
  }
  for (const id of userIds) {
    await service.auth.admin.deleteUser(id);
  }

  userIds.clear();
  displayNames.clear();
  eventTitles.clear();
  tournamentNames.clear();
}
