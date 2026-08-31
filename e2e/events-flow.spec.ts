import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Requires "Confirm email" OFF in Supabase auth settings.
test("admin creates an event, member RSVPs, headcount updates", async ({ page }) => {
  const stamp = Date.now();
  const email = `e2e-events-${stamp}@example.com`;
  const password = "e2e-password-123!";
  const title = `E2E Club Night ${stamp}`;
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let userId: string | undefined;
  try {
    // An approved admin, created directly so the test does not depend on the
    // signup + approval flow that signup-flow.spec.ts already covers.
    const { data: school } = await service.from("schools").select("id").limit(1).single();
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: `E2E Admin ${stamp}`, school_id: school!.id },
    });
    if (createError) throw createError;
    userId = created.user!.id;
    await service
      .from("profiles")
      .update({ role: "admin", status: "approved" })
      .eq("id", userId);

    await page.goto("/login");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page.getByText(/your rating/i)).toBeVisible();

    // Create the event, one week out at 7pm club time.
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await page.goto("/events/new");
    await page.fill('input[name="title"]', title);
    await page.fill('input[name="location"]', "Rack Room");
    await page.fill('input[name="starts_at_local"]', `${startsAt}T19:00`);
    await page.click('button[type="submit"]');

    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText(/no rsvps yet/i)).toBeVisible();

    // RSVP going.
    await page.getByRole("button", { name: "Going" }).click();
    await expect(page.getByText(/1 going/)).toBeVisible();

    // It shows up on the calendar.
    await page.goto("/events");
    await expect(page.getByText(title)).toBeVisible();
  } finally {
    // Cleanup order matters: events.created_by -> profiles(id) has no
    // cascade, while profiles cascades from auth.users. Deleting the user
    // first would trip a foreign-key violation and orphan the event.
    // Look the event up by its unique title rather than relying on a
    // variable the failure path may never have set.
    const { data: strays } = await service
      .from("events")
      .select("id")
      .eq("title", title);
    for (const row of strays ?? []) {
      await service.from("events").delete().eq("id", row.id);
    }
    if (userId) await service.auth.admin.deleteUser(userId);
  }
});
