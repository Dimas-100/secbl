import { expect, test } from "@playwright/test";
import { cleanupTracked, serviceClient, trackSourceName, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

// Admin connects the real Panther Pool feed on PIN (valid iCal, currently
// empty), sees it sync, then removes it. Exercises the UI, RLS on
// event_sources, and the live network path end to end.
test("admin connects a PIN feed, it syncs, and can be removed", async ({ page }) => {
  test.setTimeout(90_000);
  const stamp = Date.now();
  const email = `e2e-sources-${stamp}@example.com`;
  const password = "e2e-password-123!";
  const sourceName = `E2E PIN ${stamp}`;
  const service = serviceClient();
  trackSourceName(sourceName);

  const { data: school } = await service.from("schools").select("id").eq("short_name", "GSU").single();
  const { data: created, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `E2E Admin ${stamp}`, school_id: school!.id },
  });
  if (error) throw error;
  trackUser(created.user!.id);
  await service.from("profiles").update({ role: "admin", status: "approved" }).eq("id", created.user!.id);

  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login")),
    page.click('button[type="submit"]'),
  ]);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /event sources/i })).toBeVisible();
  await page.fill('input[name="name"]', sourceName);
  // The real Panther Pool feed is already connected in production; a query
  // string keeps this URL unique while Engage serves the same calendar.
  await page.fill('input[name="feed_url"]', `https://pin.gsu.edu/organization/pantherpool/events.ics?e2e=${stamp}`);
  await page.selectOption('select[name="school_id"]', school!.id);
  await page.getByRole("button", { name: "Connect feed" }).click();

  await expect(page.getByText(/connected .* imported \d+ event/i)).toBeVisible({ timeout: 30_000 });
  // The source's own block: the innermost div that holds both its name and
  // its sync line.
  const row = page
    .locator("div")
    .filter({ has: page.getByText(sourceName, { exact: true }) })
    .filter({ hasText: /last sync|not synced/i })
    .last();
  await expect(row.getByText(/last sync/i)).toBeVisible();

  const { data: source } = await service.from("event_sources").select("last_status, school_id").eq("name", sourceName).single();
  expect(source!.last_status).toBe("ok");
  expect(source!.school_id).toBe(school!.id);

  await row.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText(sourceName, { exact: true })).toHaveCount(0);
});
