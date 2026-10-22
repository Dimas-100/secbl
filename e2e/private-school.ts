import { expect, test, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { trackUser } from "./cleanup";

// Shared setup for the specs that run in a school with no approved real
// members (Play sheet, club night, Home), so the club never sees their users,
// nights or games. These tests write to the production project: every user is
// tracked for cleanupTracked in the spec's afterEach.

export const PASSWORD = "e2e-password-123!";

export interface TestUser {
  id: string;
  email: string;
  name: string;
}

/**
 * The id of a school with no approved members. Skips the test when every
 * school has one, and with `noOpenNight` also when a club night is already
 * open there (a spec that starts or reads a night needs it to itself).
 */
export async function privateSchool(service: SupabaseClient, opts: { noOpenNight?: boolean } = {}): Promise<string> {
  const { data: schools } = await service.from("schools").select("id");
  let schoolId: string | null = null;
  for (const s of schools ?? []) {
    const { count } = await service
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("school_id", s.id)
      .eq("status", "approved");
    if (count === 0) {
      schoolId = s.id;
      break;
    }
  }
  test.skip(!schoolId, "every school has a real member — no private school to test in");
  if (opts.noOpenNight) {
    const { count: open } = await service
      .from("club_nights")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId!)
      .is("closed_at", null);
    test.skip((open ?? 0) > 0, "a night is already open in the test school");
  }
  return schoolId!;
}

/**
 * Makes approved 450-rated members of `schoolId`, tracked for cleanup:
 * `makeUser("A")` is "E2E {label} A {stamp}" at e2e-{label}-A-{stamp}@example.com.
 */
export function userMaker(service: SupabaseClient, schoolId: string, label: string, stamp: number) {
  return async function makeUser(tag: string): Promise<TestUser> {
    const email = `e2e-${label.toLowerCase()}-${tag}-${stamp}@example.com`;
    const name = `E2E ${label} ${tag} ${stamp}`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: name, school_id: schoolId },
    });
    if (error) throw error;
    trackUser(data.user!.id);
    await service.from("profiles").update({ status: "approved", rating: 450 }).eq("id", data.user!.id);
    return { id: data.user!.id, email, name };
  };
}

/** Signs in through the login form and waits for Home. */
export async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login")),
    page.click('button[type="submit"]'),
  ]);
  await expect(page.getByRole("heading", { name: /^recent$/i })).toBeVisible();
}

/**
 * Waits for hydration. NavHistory adds a page to the per-tab trail
 * (sessionStorage "secbl:nav") from an effect, so the entry being there means
 * the page has hydrated and its buttons and Back are live. A click before that
 * can be lost (the Play button), become a full page load, or be undone when
 * React takes over (the controlled table-count radio snaps back to its default).
 */
export async function onTrail(page: Page, entry: string) {
  await page.waitForFunction(
    (want) => {
      try {
        const trail: unknown = JSON.parse(sessionStorage.getItem("secbl:nav") ?? "[]");
        return Array.isArray(trail) && trail.includes(want);
      } catch {
        return false;
      }
    },
    entry,
    { timeout: 30_000 }
  );
}
