import { expect, test } from "@playwright/test";
import { cleanupTracked, serviceClient, trackDisplayName, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

// Requires "Confirm email" OFF in Supabase auth settings (signup must return a session).
test("signup → pending → approve → home", async ({ page }) => {
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
  await expect(page.getByText(/waiting for admin approval/i)).toBeVisible();

  const { data: profile } = await service
    .from("profiles")
    .select("id")
    .eq("display_name", displayName)
    .single();
  expect(profile).not.toBeNull();
  trackUser(profile!.id);
  await service.from("profiles").update({ status: "approved" }).eq("id", profile!.id);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /^recent$/i })).toBeVisible();
});
