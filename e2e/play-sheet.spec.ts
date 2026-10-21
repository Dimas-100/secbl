import { expect, test, type Page } from "@playwright/test";
import { cleanupTracked, serviceClient, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

const PASSWORD = "e2e-password-123!";

// Spec 2026-10-21-play-and-progress §1: the tab bar's Play button opens a
// sheet with the game in progress, club night and the people you play. The
// test users live in a school with no approved real members, so B is A's
// only schoolmate and the club never sees them. B's face is checked by its
// link, not clicked: the scoreboard with an opponent picked publishes a live
// table to every member's Home.
test("the Play sheet resumes a game, offers faces and opens club night", async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const service = serviceClient();

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
  const { count: open } = await service
    .from("club_nights")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId!)
    .is("closed_at", null);
  test.skip((open ?? 0) > 0, "a night is already open in the test school");

  async function makeUser(tag: string) {
    const email = `e2e-play-${tag}-${stamp}@example.com`;
    const name = `E2E Play ${tag} ${stamp}`;
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
  }
  const a = await makeUser("A");
  const b = await makeUser("B");

  async function logIn(p: Page, email: string) {
    await p.goto("/login");
    await p.fill('input[name="email"]', email);
    await p.fill('input[name="password"]', PASSWORD);
    await Promise.all([
      p.waitForURL((u) => !u.pathname.startsWith("/login")),
      p.click('button[type="submit"]'),
    ]);
    await expect(p.getByRole("heading", { name: /^recent$/i })).toBeVisible();
  }
  await logIn(page, a.email);

  const sheet = page.getByRole("dialog", { name: "Play" });
  const openPlay = () => page.getByRole("button", { name: "Play", exact: true }).click();

  // No night at the school: the sheet offers to start one. A has no games,
  // so the faces fill from the school — B is the only one there.
  await openPlay();
  await expect(sheet).toBeVisible();
  // The sheet fetches on open; the first call also compiles the action in dev.
  await expect(sheet.getByRole("link", { name: /^Start club night/ })).toBeVisible({ timeout: 15_000 });
  const face = sheet
    .getByRole("region", { name: "Play someone now" })
    .getByRole("link", { name: b.name, exact: true });
  await expect(face).toBeVisible();
  await expect(face).toHaveAttribute("href", new RegExp(`/matches/new\\?opponent=${b.id}`));

  // A scoreboard draft against B (2–1) is a game to go back to.
  await page.evaluate(
    ({ key, opponentId }) =>
      localStorage.setItem(key, JSON.stringify({ at: Date.now(), opponentId, you: 2, them: 1 })),
    { key: `secbl:draft-game:${a.id}`, opponentId: b.id }
  );
  await page.goto("/leaderboard");
  await openPlay();
  await expect(sheet.getByRole("link", { name: /Back to your game/ })).toContainText("2–1 vs E2E");

  // Navigating from inside the sheet leaves no sheet open on the next page.
  await sheet.getByRole("link", { name: /^Start club night/ }).click();
  await expect(page).toHaveURL(/\/night$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();

  // Spec §6/§9: another player's page offers "Play {first name}" (checked by
  // its href, not clicked: it would publish a live table) and Back returns to
  // where the member came from.
  await page.goto("/leaderboard?tab=players");
  await expect(async () => {
    await page.locator(`a[href="/players/${b.id}"]`).first().click();
    await expect(page.getByRole("link", { name: "Play E2E", exact: true })).toBeVisible({ timeout: 3_000 });
  }).toPass();
  await expect(page.getByRole("link", { name: "Play E2E", exact: true })).toHaveAttribute(
    "href",
    new RegExp(`opponent=${b.id}`)
  );
  await expect(async () => {
    await page.getByRole("link", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(/tab=players/, { timeout: 3_000 });
  }).toPass();

  // A fresh tab has no in-app history: Back falls back to the leaderboard and
  // never leaves the app.
  const fresh = await page.context().newPage();
  await fresh.goto(`/players/${b.id}`);
  await expect(async () => {
    await fresh.getByRole("link", { name: "Back", exact: true }).click();
    await expect(fresh).toHaveURL((u) => u.pathname === "/leaderboard", { timeout: 3_000 });
  }).toPass();
  await expect(fresh.getByRole("navigation", { name: "Main" })).toBeVisible();

  // Spec §7: Events keeps three tabs and no club night row; an empty calendar
  // points to Play.
  await page.goto("/events");
  // The filter is a nav of links (UnderlineTabs), not an ARIA tablist.
  const tabs = page.getByRole("navigation", { name: "Event filter" }).getByRole("link");
  await expect(tabs).toHaveText(["Upcoming", "Past", "Cups"]);
  await expect(page.getByRole("link", { name: "Club night" })).toHaveCount(0);
  // The page lists every event (cancelled too) until it ends, so the empty
  // copy only shows when no event, of any status, is still ahead.
  const { data: all } = await service.from("events").select("starts_at, ends_at");
  const anyUpcoming = (all ?? []).some((e) => new Date(e.ends_at ?? e.starts_at).getTime() >= Date.now());
  if (!anyUpcoming) {
    await expect(page.getByText("Start a club night from Play")).toBeVisible();
  }
});
