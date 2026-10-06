import { expect, test } from "@playwright/test";
import { cleanupTracked, serviceClient, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

const PASSWORD = "e2e-password-123!";

// Log out does async push cleanup before the real submit; this pins that the
// session actually ends and the member lands on /login.
test("log out from Settings ends the session", async ({ page }) => {
  const stamp = Date.now();
  const service = serviceClient();
  const { data: school } = await service.from("schools").select("id").limit(1).single();
  const email = `e2e-logout-${stamp}@example.com`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: `E2E Logout ${stamp}`, school_id: school!.id },
  });
  if (error) throw error;
  trackUser(data.user!.id);
  await service.from("profiles").update({ status: "approved" }).eq("id", data.user!.id);

  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login")),
    page.click('button[type="submit"]'),
  ]);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL(/\/login/, { timeout: 15_000 });
  // The session is gone: a member page bounces back to login.
  await page.goto("/");
  await page.waitForURL(/\/login/);
  await expect(page.locator('input[name="email"]')).toBeVisible();
});
