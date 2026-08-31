import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Requires "Confirm email" OFF in Supabase auth settings (signup must return a session).
test("signup → pending → approve → home", async ({ page }) => {
  const email = `e2e-${Date.now()}@gmail.com`;
  const displayName = email.slice(0, 40);
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let userId: string | undefined;
  try {
    await page.goto("/signup");
    // display_name doubles as a unique lookup key for this test run.
    await page.fill('input[name="display_name"]', displayName);
    await page.selectOption('select[name="school_id"]', { index: 1 });
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
    userId = profile!.id;
    await service.from("profiles").update({ status: "approved" }).eq("id", userId);

    await page.goto("/");
    await expect(page.getByText(/your rating/i)).toBeVisible();
  } finally {
    // Resolve the user id defensively: the failure path may never have
    // reached the profile lookup above, so look it up again by the unique
    // display_name if the variable is still unset. profiles cascades from
    // auth.users, so a single deleteUser is sufficient here.
    if (!userId) {
      const { data: stray } = await service
        .from("profiles")
        .select("id")
        .eq("display_name", displayName)
        .maybeSingle();
      userId = stray?.id;
    }
    if (userId) await service.auth.admin.deleteUser(userId);
  }
});
