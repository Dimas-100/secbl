import { expect, test } from "@playwright/test";
import { cleanupTracked, serviceClient, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

// Exercises the real reset flow without depending on email delivery: the admin
// API mints the same recovery token Supabase would have emailed, and the test
// opens the callback URL exactly as a member clicking the link would.
test("forgot password → reset link → new password → log in", async ({ page }) => {
  const stamp = Date.now();
  const email = `e2e-reset-${stamp}@example.com`;
  const oldPassword = "e2e-old-password-1!";
  const newPassword = "e2e-new-password-2!";
  const service = serviceClient();

  const { data: school } = await service.from("schools").select("id").limit(1).single();
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password: oldPassword,
    email_confirm: true,
    user_metadata: { display_name: `Reset ${stamp}`, school_id: school!.id },
  });
  if (createError) throw createError;
  trackUser(created.user!.id);
  await service.from("profiles").update({ status: "approved" }).eq("id", created.user!.id);

  // The request form must not reveal whether the address has an account.
  await page.goto("/forgot-password");
  await page.fill('input[name="email"]', email);
  await page.click('button[type="submit"]');
  await expect(page.getByText(/reset link is on its way/i)).toBeVisible();

  // The same token the email would carry.
  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  if (linkError) throw linkError;
  const tokenHash = link.properties!.hashed_token;

  await page.goto(`/auth/callback?token_hash=${tokenHash}&type=recovery&next=/reset-password`);
  await expect(page.getByRole("heading", { name: /choose a new password/i })).toBeVisible();

  // Mismatched entries are rejected before anything is changed.
  await page.fill('input[name="password"]', newPassword);
  await page.fill('input[name="confirm"]', "something-else-entirely");
  await page.click('button[type="submit"]');
  await expect(page.getByText(/passwords do not match/i)).toBeVisible();

  await page.fill('input[name="password"]', newPassword);
  await page.fill('input[name="confirm"]', newPassword);
  await page.click('button[type="submit"]');
  await expect(page.getByText(/your rating/i)).toBeVisible();

  // The new password works. Drop the recovery session by clearing cookies
  // rather than clicking Log out, which only exists inside the member layout.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', newPassword);
  await page.click('button[type="submit"]');
  await expect(page.getByText(/your rating/i)).toBeVisible();

  // ...and a spent link cannot be replayed.
  await page.goto(`/auth/callback?token_hash=${tokenHash}&type=recovery&next=/reset-password`);
  await expect(page.getByText(/expired or was already used/i)).toBeVisible();
});
