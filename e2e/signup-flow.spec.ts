import { expect, test } from "@playwright/test";
import { cleanupTracked, serviceClient, trackDisplayName, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

// Requires "Confirm email" OFF in Supabase auth settings (signup must return a session).
test("signup → straight in → home", async ({ page }) => {
  const email = `e2e-${Date.now()}@gmail.com`;
  const displayName = email.slice(0, 40);
  const service = serviceClient();

  // Registered before the account exists, so teardown finds it however the
  // test ends — including a timeout, which skips try/finally entirely.
  trackDisplayName(displayName);

  await page.goto("/signup");
  // display_name doubles as a unique lookup key for this test run.
  await page.fill('input[name="display_name"]', displayName);
  // Schools are picked by tapping a tile (a radio group under the hood).
  await page.getByRole("radio", { name: /University|Institute/ }).first().check({ force: true });
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(1);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "e2e-password-123!");
  await page.click('button[type="submit"]');
  // Membership is open: the trigger approves the profile, so Home comes up
  // straight away with the league's rooms already joined.
  await expect(page.getByRole("heading", { name: /^recent$/i })).toBeVisible();

  const { data: profile } = await service
    .from("profiles")
    .select("id, status")
    .eq("display_name", displayName)
    .single();
  expect(profile?.status).toBe("approved");
  trackUser(profile!.id);
  await page.goto("/chat");
  await expect(page.getByRole("link", { name: /^Everyone/ })).toBeVisible();
});
