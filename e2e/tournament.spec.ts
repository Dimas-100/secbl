import { expect, test } from "@playwright/test";
import { cleanupTracked, serviceClient, trackTournamentName, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

const PASSWORD = "e2e-password-123!";

test("admin runs a 4-player tournament to a champion", async ({ page }) => {
  const stamp = Date.now();
  const service = serviceClient();
  const name = `E2E Cup ${stamp}`;
  // Registered before anything is created, so teardown removes it however the
  // test ends — including a timeout, which abandons the test body mid-await.
  trackTournamentName(name);

  const { data: school } = await service.from("schools").select("id").limit(1).single();
  async function makeUser(suffix: string, role: "admin" | "member") {
    const email = `e2e-cup-${suffix}-${stamp}@example.com`;
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: `Cup ${suffix} ${stamp}`, school_id: school!.id },
    });
    if (error) throw error;
    trackUser(data.user!.id);
    await service.from("profiles").update({ role, status: "approved" }).eq("id", data.user!.id);
    return { id: data.user!.id, email };
  }

  const admin = await makeUser("admin", "admin");
  await makeUser("p1", "member");
  await makeUser("p2", "member");
  await makeUser("p3", "member");

  await page.goto("/login");
  await page.fill('input[name="email"]', admin.email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login")),
    page.click('button[type="submit"]'),
  ]);

  await page.goto("/tournaments/new");
  await page.fill('input[name="name"]', name);
  await page.click('button[type="submit"]');
  await expect(page.getByRole("heading", { name })).toBeVisible();

  // Check the four test players. Everyone in this club is a candidate, so
  // select by the value of each checkbox rather than by position.
  for (const id of [admin.id]) {
    await page.locator(`input[type="checkbox"][value="${id}"]`).check();
  }
  const others = await service
    .from("profiles")
    .select("id, display_name")
    .like("display_name", `Cup %${stamp}`);
  for (const row of others.data ?? []) {
    await page.locator(`input[type="checkbox"][value="${row.id}"]`).check();
  }
  await page.getByRole("button", { name: "Save entrants" }).click();
  await expect(page.getByText(/entrants saved/i)).toBeVisible();

  // Tap-in-order seeding: the admin tapped themselves first, so they are
  // seed 1. Tap them out and back in — they drop to the last seed and p1
  // becomes seed 1. Start submits the order as shown.
  const p1Name = `Cup p1 ${stamp}`;
  const adminBox = page.locator(`input[type="checkbox"][value="${admin.id}"]`);
  await adminBox.uncheck();
  await adminBox.check();
  await expect(page.getByText(new RegExp(`${p1Name} is seed 1`))).toBeVisible();
  await page.getByRole("button", { name: /start tournament/i }).click();
  await expect(page.getByRole("heading", { name: /^(Round 1|Semifinals|Final)$/ }).first()).toBeVisible();
  // The card shows the seed under the name ("1 · GSU").
  await expect(page.locator("article", { hasText: p1Name }).first().getByText(/^1 · /)).toBeVisible();

  // Play every match that is ready, round by round, until a champion exists.
  // Scoring happens on the match's own sheet: tap + until the race is won
  // (5–3 in a race to 5), Save, land back on the bracket.
  for (let guard = 0; guard < 10; guard++) {
    const score = page.getByRole("link", { name: "Score this match" });
    if ((await score.count()) === 0) break;
    await score.first().click();
    await page.waitForURL(/\/score\/[0-9a-f-]{36}$/);
    const form = page.locator("form[data-result-entry]");
    const increase = form.getByRole("button", { name: /^Increase/ });
    for (let i = 0; i < 3; i++) await increase.nth(1).click();
    for (let i = 0; i < 5; i++) await increase.nth(0).click();
    await expect(form.getByRole("button", { name: "Save result" })).toBeEnabled();
    await form.getByRole("button", { name: "Save result" }).click();
    // The action redirects to the bracket once the result (and the ladder
    // replay behind it) has landed.
    await page.waitForURL(/\/tournaments\/[0-9a-f-]{36}$/);
  }

  await expect(page.getByRole("heading", { name: "Champion" })).toBeVisible();

  // The ladder moved, and it equals a replay: every confirmed tournament match
  // has non-null deltas written by the recompute.
  const { data: rated } = await service
    .from("matches")
    .select("id, rating_delta_reporter, rating_delta_opponent")
    .not("tournament_match_id", "is", null);
  expect((rated ?? []).length).toBeGreaterThan(0);
  for (const m of rated ?? []) {
    expect(m.rating_delta_reporter).not.toBeNull();
    expect(m.rating_delta_opponent).not.toBeNull();
  }
});
