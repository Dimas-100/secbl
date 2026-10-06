import { expect, test } from "@playwright/test";
import { cleanupTracked, serviceClient, trackUser } from "./cleanup";

test.afterEach(cleanupTracked);

const PASSWORD = "e2e-password-123!";

test("member renames themselves; admin suspends and reinstates them", async ({ page }) => {
  const stamp = Date.now();
  const adminEmail = `e2e-admin-${stamp}@example.com`;
  const memberEmail = `e2e-member-${stamp}@example.com`;
  const originalName = `Typoo ${stamp}`;
  const fixedName = `Fixed ${stamp}`;
  const service = serviceClient();

  const { data: school } = await service.from("schools").select("id").limit(1).single();
  async function makeUser(email: string, displayName: string, role: "admin" | "member") {
    const { data, error } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: displayName, school_id: school!.id },
    });
    if (error) throw error;
    trackUser(data.user!.id);
    await service.from("profiles").update({ role, status: "approved" }).eq("id", data.user!.id);
    return data.user!.id;
  }
  await makeUser(adminEmail, `E2E Admin ${stamp}`, "admin");
  const memberId = await makeUser(memberEmail, originalName, "member");

  async function logIn(email: string) {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    // Wait for the redirect to actually land, or a following goto() races the
    // in-flight sign-in POST and cancels it — leaving us anonymous on /login.
    // A suspended member lands on /pending, so assert only that we left /login.
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith("/login")),
      page.click('button[type="submit"]'),
    ]);
  }

  // The member fixes the typo in their own name.
  await logIn(memberEmail);
  await expect(page.getByRole("heading", { name: /league feed/i })).toBeVisible();
  await page.goto("/settings");
  await page.fill('input[name="display_name"]', fixedName);
  // Settings now has two forms (Your look above Your name): name the button.
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText(/name updated/i)).toBeVisible();
  await page.goto("/leaderboard");
  await expect(page.getByText(fixedName)).toBeVisible();
  await expect(page.getByText(originalName)).toHaveCount(0);

  // The admin suspends them. The Members list shows every other member of the
  // club, so scope to this member's own row via the id its form carries.
  const memberForm = page.locator(`form:has(input[value="${memberId}"])`);

  await logIn(adminEmail);
  await page.goto("/admin");
  await expect(page.getByText(fixedName)).toBeVisible();
  await memberForm.getByRole("button", { name: "Suspend" }).click();
  // The button flipping to Reinstate is the proof the status changed.
  await expect(memberForm.getByRole("button", { name: "Reinstate" })).toBeVisible();

  // They can still sign in, but they are out of the club.
  await logIn(memberEmail);
  await expect(page.getByRole("heading", { name: /account suspended/i })).toBeVisible();
  await page.goto("/leaderboard");
  await expect(page.getByRole("heading", { name: /account suspended/i })).toBeVisible();

  // The admin reinstates them and everything comes back.
  await logIn(adminEmail);
  await page.goto("/admin");
  await memberForm.getByRole("button", { name: "Reinstate" }).click();
  await expect(memberForm.getByRole("button", { name: "Suspend" })).toBeVisible();

  await logIn(memberEmail);
  await expect(page.getByRole("heading", { name: /league feed/i })).toBeVisible();

  // Rating and history survived the suspension untouched.
  const { data: profile } = await service
    .from("profiles")
    .select("display_name, rating, status")
    .eq("id", memberId)
    .single();
  expect(profile!.status).toBe("approved");
  expect(profile!.display_name).toBe(fixedName);
  expect(profile!.rating).toBe(450);
});
