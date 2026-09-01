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
    await page.locator(`input[name="profile_ids"][value="${id}"]`).check();
  }
  const others = await service
    .from("profiles")
    .select("id, display_name")
    .like("display_name", `Cup %${stamp}`);
  for (const row of others.data ?? []) {
    await page.locator(`input[name="profile_ids"][value="${row.id}"]`).check();
  }
  await page.getByRole("button", { name: "Save entrants" }).click();
  await expect(page.getByText(/entrants saved/i)).toBeVisible();

  await page.getByRole("button", { name: /start tournament/i }).click();
  await expect(page.getByRole("heading", { name: "Round 1" })).toBeVisible();

  // Play every match that is ready, round by round, until a champion exists.
  for (let guard = 0; guard < 10; guard++) {
    const forms = page.locator("form:has(select[name='winner_id'])");
    if ((await forms.count()) === 0) break;
    const form = forms.first();
    const matchId = await form.locator('input[name="tournament_match_id"]').inputValue();
    await form.locator('input[name="player1_score"]').fill("5");
    await form.locator('input[name="player2_score"]').fill("3");
    await form.locator('select[name="winner_id"]').selectOption({ index: 1 });
    await form.getByRole("button", { name: "Save" }).click();
    // Wait for THIS match's entry form to go away, i.e. for the action's
    // fresh payload to actually reach the DOM. "networkidle" is not enough:
    // a Server Action returns the re-rendered route inside its own response,
    // so the network can fall idle a render before the bracket updates, and
    // the next iteration would then act on an already-decided match.
    await expect(
      page.locator(
        `form:has(input[name="tournament_match_id"][value="${matchId}"]):has(select[name='winner_id'])`
      )
    ).toHaveCount(0);
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
