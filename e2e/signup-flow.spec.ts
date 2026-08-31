import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Requires "Confirm email" OFF in Supabase auth settings (signup must return a session).
test("signup → pending → approve → home", async ({ page }) => {
  const email = `e2e-${Date.now()}@gmail.com`;
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  await page.goto("/signup");
  // display_name doubles as a unique lookup key for this test run.
  await page.fill('input[name="display_name"]', email.slice(0, 40));
  await page.selectOption('select[name="school_id"]', { index: 1 });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "e2e-password-123!");
  await page.click('button[type="submit"]');
  await expect(page.getByText(/waiting for admin approval/i)).toBeVisible();

  const { data: profile } = await service
    .from("profiles")
    .select("id")
    .eq("display_name", email.slice(0, 40))
    .single();
  expect(profile).not.toBeNull();
  await service.from("profiles").update({ status: "approved" }).eq("id", profile!.id);

  await page.goto("/");
  await expect(page.getByText(/your rating/i)).toBeVisible();

  await service.auth.admin.deleteUser(profile!.id);
});
